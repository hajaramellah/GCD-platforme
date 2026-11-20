import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '3000', 10);

// Allow JSON body up to 25MB for camera image & PDF uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Initialize Google GenAI client
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_COOKIE_NAME = 'gcd_session';
const ONBOARDING_COOKIE_NAME = 'gcd_google_onboarding';
const OAUTH_STATE_COOKIE_NAME = 'gcd_oauth_state';
const ALLOWED_GOOGLE_DOMAIN = 'usmba.ac.ma';
const DOMAIN_DENIED_MESSAGE =
  'Accès refusé. Veuillez utiliser votre compte Google académique USMBA (@usmba.ac.ma).';

/**
 * Helper to mask sensitive information for technical diagnostic logging (no PII in logs)
 */
function maskSensitiveData(str?: string): string {
  if (!str || str.trim().length === 0) return 'Non présent';
  const clean = str.trim();
  if (clean.length <= 4) return '***';
  return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
}

/**
 * Clean markdown code fences from JSON output
 */
function cleanJsonString(str: string): string {
  let clean = str.trim();
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*/, '').replace(/```\s*$/, '');
  }
  return clean.trim();
}

/**
 * Cookie parser & HMAC-signed stateless/server-backed session helpers
 */
function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      cookies[k] = v;
    }
  }
  return cookies;
}

interface SessionPayload {
  userId: string;
  email: string;
  currentRole: string;
  roles: string[];
  exp: number;
}

interface GoogleOnboardingPayload {
  kind: 'google_onboarding';
  googleId: string;
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  photoUrl: string;
  emailVerified: boolean;
  exp: number;
}

function signTokenPayload<T extends object>(payload: T): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyTokenPayload<T extends { exp?: number }>(token?: string): T | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as T;
    if (typeof parsed.exp !== 'number' || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function signSessionToken(payload: SessionPayload): string {
  return signTokenPayload(payload);
}

function verifySessionToken(token?: string): SessionPayload | null {
  const parsed = verifyTokenPayload<SessionPayload>(token);
  if (!parsed || !parsed.userId || !parsed.email) return null;
  return parsed;
}

function isHttpsRequest(req: Request): boolean {
  const protoHeader = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return req.secure || protoHeader.includes('https') || process.env.NODE_ENV === 'production';
}

function getAuthCookieOptions(req: Request, maxAgeMs: number) {
  const secure = isHttpsRequest(req);
  return {
    httpOnly: true,
    sameSite: (secure ? 'none' : 'lax') as 'none' | 'lax',
    secure,
    partitioned: secure,
    maxAge: maxAgeMs,
    path: '/',
  } as any;
}

function setSessionCookie(req: Request, res: Response, payload: Omit<SessionPayload, 'exp'>): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const token = signSessionToken(fullPayload);
  res.cookie(SESSION_COOKIE_NAME, token, getAuthCookieOptions(req, 1000 * 60 * 60 * 24 * 7));
  return token;
}

function setOnboardingCookie(req: Request, res: Response, payload: Omit<GoogleOnboardingPayload, 'exp' | 'kind'>): string {
  const fullPayload: GoogleOnboardingPayload = {
    ...payload,
    kind: 'google_onboarding',
    exp: Date.now() + 1000 * 60 * 30, // 30 minutes
  };
  const token = signTokenPayload(fullPayload);
  res.cookie(ONBOARDING_COOKIE_NAME, token, getAuthCookieOptions(req, 1000 * 60 * 30));
  return token;
}

function extractExactEmailDomain(email: string): string {
  const normalized = String(email || '').trim().toLowerCase();
  const parts = normalized.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return '';
  return parts[1];
}

function isStrictUsmbaDomain(email: string): boolean {
  return extractExactEmailDomain(email) === ALLOWED_GOOGLE_DOMAIN;
}

function isEmailVerifiedFlag(value: unknown): boolean {
  return value === true || value === 'true';
}

function getConfiguredGoogleClientIds(): string[] {
  const ids = [process.env.GOOGLE_CLIENT_ID, process.env.VITE_GOOGLE_CLIENT_ID]
    .map((v) => (v || '').trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function getAppBaseUrl(req: Request): string {
  const appUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  if (appUrl && !appUrl.includes('MY_APP_URL')) {
    return appUrl;
  }
  const proto = isHttpsRequest(req) ? 'https' : req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function getOAuthRedirectUri(req: Request): string {
  return `${getAppBaseUrl(req)}/auth/google/callback`;
}

// Single-use in-memory stores for OAuth CSRF state & cross-origin popup -> iframe exchange codes
const pendingOAuthStates = new Map<
  string,
  { nonce: string; mode: string; redirectUri: string; openerOrigin: string; exp: number }
>();
const pendingOAuthExchanges = new Map<
  string,
  {
    accountExists: boolean;
    existingUser?: ServerUser;
    identity?: VerifiedGoogleIdentity;
    exp: number;
  }
>();

function pruneExpiredOAuthMaps() {
  const now = Date.now();
  for (const [k, v] of pendingOAuthStates.entries()) {
    if (v.exp <= now) pendingOAuthStates.delete(k);
  }
  for (const [k, v] of pendingOAuthExchanges.entries()) {
    if (v.exp <= now) pendingOAuthExchanges.delete(k);
  }
}

interface VerifiedGoogleIdentity {
  googleId: string;
  email: string;
  hd: string | null;
  name: string;
  givenName: string;
  familyName: string;
  photoUrl: string;
  emailVerified: boolean;
}

async function verifyGoogleIdTokenStrict(
  credential: string
): Promise<
  | { ok: true; identity: VerifiedGoogleIdentity }
  | { ok: false; status: number; errorCode: string; message: string }
> {
  const allowedClientIds = getConfiguredGoogleClientIds();
  if (allowedClientIds.length === 0) {
    return {
      ok: false,
      status: 503,
      errorCode: 'OAUTH_NOT_CONFIGURED',
      message:
        'La configuration Google OAuth (GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET) est absente sur le serveur.',
    };
  }

  if (!credential || typeof credential !== 'string' || credential.length < 20) {
    return {
      ok: false,
      status: 400,
      errorCode: 'MISSING_TOKEN',
      message: 'Jeton d\'authentification Google manquant ou invalide.',
    };
  }

  let tokenData: any;
  try {
    const tokenResp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
    if (!tokenResp.ok) {
      return {
        ok: false,
        status: 401,
        errorCode: 'INVALID_TOKEN',
        message: 'Jeton Google OAuth invalide ou expiré.',
      };
    }
    tokenData = await tokenResp.json();
  } catch (e) {
    console.error('Google tokeninfo verification failed:', e);
    return {
      ok: false,
      status: 502,
      errorCode: 'GOOGLE_UNREACHABLE',
      message: 'Impossible de vérifier le jeton auprès des serveurs Google.',
    };
  }

  // Verify issuer
  const validIssuers = new Set(['https://accounts.google.com', 'accounts.google.com']);
  if (!tokenData.iss || !validIssuers.has(String(tokenData.iss))) {
    return {
      ok: false,
      status: 401,
      errorCode: 'INVALID_ISSUER',
      message: 'Émetteur du jeton Google non autorisé.',
    };
  }

  // Verify expiration
  const expSec = Number(tokenData.exp || 0);
  if (!expSec || expSec * 1000 <= Date.now()) {
    return {
      ok: false,
      status: 401,
      errorCode: 'TOKEN_EXPIRED',
      message: 'Le jeton Google OAuth est expiré. Veuillez vous réauthentifier.',
    };
  }

  // Verify audience strictly against configured Client IDs
  if (!allowedClientIds.includes(String(tokenData.aud || ''))) {
    return {
      ok: false,
      status: 401,
      errorCode: 'INVALID_AUDIENCE',
      message: 'Le jeton Google ne correspond pas au Client ID de l\'application.',
    };
  }

  // Verify email_verified === true strictly
  if (!isEmailVerifiedFlag(tokenData.email_verified)) {
    return {
      ok: false,
      status: 403,
      errorCode: 'EMAIL_NOT_VERIFIED',
      message: 'Accès refusé. Votre adresse e-mail Google doit être vérifiée (email_verified = true).',
    };
  }

  // Verify hosted domain (hd) claim whenever present
  const hdValue =
    tokenData.hd !== undefined && tokenData.hd !== null
      ? String(tokenData.hd).trim().toLowerCase()
      : null;
  if (hdValue !== null && hdValue !== ALLOWED_GOOGLE_DOMAIN) {
    return {
      ok: false,
      status: 403,
      errorCode: 'HOSTED_DOMAIN_DENIED',
      message: DOMAIN_DENIED_MESSAGE,
    };
  }

  // Verify exact email domain === usmba.ac.ma
  const emailNormalized = String(tokenData.email || '').trim().toLowerCase();
  if (!emailNormalized || !isStrictUsmbaDomain(emailNormalized)) {
    return {
      ok: false,
      status: 403,
      errorCode: 'DOMAIN_DENIED',
      message: DOMAIN_DENIED_MESSAGE,
    };
  }

  const googleSub = String(tokenData.sub || '').trim();
  if (!googleSub) {
    return {
      ok: false,
      status: 401,
      errorCode: 'MISSING_SUBJECT',
      message: 'Identifiant Google (sub) manquant dans le jeton vérifié.',
    };
  }

  return {
    ok: true,
    identity: {
      googleId: googleSub,
      email: emailNormalized,
      hd: hdValue,
      name: String(tokenData.name || `${tokenData.given_name || ''} ${tokenData.family_name || ''}`.trim()),
      givenName: String(tokenData.given_name || ''),
      familyName: String(tokenData.family_name || ''),
      photoUrl: String(tokenData.picture || ''),
      emailVerified: true,
    },
  };
}

/**
 * In-memory Server Stores (authoritative server-side RBAC, documents & APOGÉE demo data)
 * Note: Seeded demo accounts do NOT automatically own a Google account (googleId starts undefined).
 */
interface ServerUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  cin: string;
  cne?: string;
  phone: string;
  establishmentId: string;
  laboratoryId?: string;
  roles: string[];
  currentRole: string;
  isActive: boolean;
  isEmailVerified: boolean;
  googleId?: string;
  googleLinkedAt?: string;
  studentOriginType?: 'interne_usmba' | 'externe';
  originEstablishment?: string;
  masterSpecialty?: string;
  registrationMethod?: 'camera' | 'upload' | 'manual';
  identityDocuments?: {
    cinImage?: string;
    studentCardImage?: string;
    scannedAt?: string;
  };
  createdAt: string;
}

function createServerDemoPdfDataUrl(title: string, linesOrPages: string[] | string[][]): string {
  const esc = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

  const pages: string[][] = Array.isArray(linesOrPages[0])
    ? (linesOrPages as string[][])
    : [linesOrPages as string[]];
  const pageCount = pages.length;
  const pageRefs: string[] = [];
  const pageObjects: string[] = [];

  for (let p = 0; p < pageCount; p++) {
    const pageObjId = 4 + p * 2;
    const contentObjId = 5 + p * 2;
    pageRefs.push(`${pageObjId} 0 R`);
    const lines = (pages[p] || []).slice(0, 22);
    const ops = [
      'BT',
      '/F1 14 Tf',
      '50 760 Td',
      `(${esc(title)}) Tj`,
      '/F1 10 Tf',
      '0 -24 Td',
      `(DOCUMENT DE DEMONSTRATION - GCD USMBA FES - Page ${p + 1}/${pageCount}) Tj`,
      '0 -18 Td',
      ...lines.flatMap((l) => [`(${esc(l)}) Tj`, '0 -16 Td']),
      'ET',
    ].join('\n');

    pageObjects.push(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentObjId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`
    );
    pageObjects.push(
      `${contentObjId} 0 obj\n<< /Length ${ops.length} >>\nstream\n${ops}\nendstream\nendobj\n`
    );
  }

  const objs = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageCount} >>\nendobj\n`,
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    ...pageObjects,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const o of objs) {
    offsets.push(pdf.length);
    pdf += o;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return `data:application/pdf;base64,${Buffer.from(pdf, 'utf-8').toString('base64')}`;
}

function createServerDemoPngDataUrl(): string {
  // Deterministic 140x160 PNG portrait placeholder card for identity photo preview
  const width = 140;
  const height = 160;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const idx = rowStart + 1 + x * 4;
      const isBorder = x < 4 || x >= width - 4 || y < 4 || y >= height - 4;
      const dxHead = x - 70;
      const dyHead = y - 56;
      const isHead = dxHead * dxHead + dyHead * dyHead <= 24 * 24;
      const dxBody = x - 70;
      const dyBody = y - 140;
      const isBody = (dxBody * dxBody) / (44 * 44) + (dyBody * dyBody) / (54 * 54) <= 1 && y >= 86;
      if (isBorder) {
        raw[idx] = 15; raw[idx + 1] = 118; raw[idx + 2] = 110; raw[idx + 3] = 255;
      } else if (isHead || isBody) {
        raw[idx] = 30; raw[idx + 1] = 41; raw[idx + 2] = 59; raw[idx + 3] = 255;
      } else {
        raw[idx] = 241; raw[idx + 1] = 245; raw[idx + 2] = 249; raw[idx + 3] = 255;
      }
    }
  }
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const makeChunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw);
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

const serverUsers = new Map<string, ServerUser>([
  [
    'usr-candidat-1',
    {
      id: 'usr-candidat-1',
      email: 'kenza.benali@usmba.ac.ma',
      firstName: 'Kenza',
      lastName: 'Benali',
      cin: 'CD654321',
      cne: 'N134098765',
      phone: '+212 6 61 23 45 67',
      establishmentId: 'fsdm',
      roles: ['candidat'],
      currentRole: 'candidat',
      isActive: true,
      isEmailVerified: true,
      studentOriginType: 'interne_usmba',
      originEstablishment: 'Faculté des Sciences Dhar El Mahraz (USMBA - Fès)',
      masterSpecialty: 'Informatique Décisionnelle et Systèmes Intelligents (IDSI)',
      createdAt: '2026-09-15T08:30:00Z',
    },
  ],
  [
    'usr-candidat-2',
    {
      id: 'usr-candidat-2',
      email: 'youssef.berrada@usmba.ac.ma',
      firstName: 'Youssef',
      lastName: 'Berrada',
      cin: 'CD712390',
      cne: 'N138129845',
      phone: '+212 6 70 88 99 00',
      establishmentId: 'ensa',
      roles: ['candidat'],
      currentRole: 'candidat',
      isActive: true,
      isEmailVerified: true,
      studentOriginType: 'interne_usmba',
      originEstablishment: 'École Nationale des Sciences Appliquées de Fès (USMBA)',
      masterSpecialty: 'Génie Énergétique et Systèmes Solaires',
      createdAt: '2026-09-20T10:15:00Z',
    },
  ],
  [
    'usr-candidat-3',
    {
      id: 'usr-candidat-3',
      email: 'amine.tazi@usmba.ac.ma',
      firstName: 'Amine',
      lastName: 'Tazi',
      cin: 'CD823451',
      cne: 'N139445566',
      phone: '+212 6 68 12 34 90',
      establishmentId: 'fsdm',
      roles: ['candidat'],
      currentRole: 'candidat',
      isActive: true,
      isEmailVerified: true,
      studentOriginType: 'interne_usmba',
      originEstablishment: 'Faculté des Sciences Dhar El Mahraz (USMBA - Fès)',
      masterSpecialty: 'Réseaux, Systèmes et Sécurité Informatique',
      createdAt: '2026-09-23T09:00:00Z',
    },
  ],
  [
    'usr-candidat-4',
    {
      id: 'usr-candidat-4',
      email: 'nadia.chraibi@usmba.ac.ma',
      firstName: 'Nadia',
      lastName: 'Chraibi',
      cin: 'BE849201',
      cne: 'R145029384',
      phone: '+212 6 65 44 33 22',
      establishmentId: 'fsdm',
      roles: ['candidat'],
      currentRole: 'candidat',
      isActive: true,
      isEmailVerified: true,
      studentOriginType: 'externe',
      originEstablishment: "Université Hassan II de Casablanca — Faculté des Sciences Ben M'Sik",
      masterSpecialty: 'Master Génie Logiciel et Systèmes Distribués',
      createdAt: '2026-09-21T09:00:00Z',
    },
  ],
  [
    'usr-candidat-5',
    {
      id: 'usr-candidat-5',
      email: 'tarik.elmansouri@usmba.ac.ma',
      firstName: 'Tarik',
      lastName: 'El Mansouri',
      cin: 'AE519204',
      cne: 'M142087612',
      phone: '+212 6 63 22 44 88',
      establishmentId: 'fsdm',
      roles: ['candidat'],
      currentRole: 'candidat',
      isActive: true,
      isEmailVerified: true,
      studentOriginType: 'externe',
      originEstablishment: 'Université Cadi Ayyad de Marrakech — Faculté des Sciences Semlalia',
      masterSpecialty: 'Master Systèmes Intelligents & Énergie',
      createdAt: '2026-10-05T10:00:00Z',
    },
  ],
  [
    'usr-candidat-6',
    {
      id: 'usr-candidat-6',
      email: 'imane.bennani@usmba.ac.ma',
      firstName: 'Imane',
      lastName: 'Bennani',
      cin: 'CD781234',
      cne: 'N136778899',
      phone: '+212 6 69 77 88 11',
      establishmentId: 'fsdm',
      roles: ['candidat'],
      currentRole: 'candidat',
      isActive: true,
      isEmailVerified: true,
      studentOriginType: 'interne_usmba',
      originEstablishment: 'Faculté des Sciences Dhar El Mahraz (USMBA - Fès)',
      masterSpecialty: 'Master Science des Données et Systèmes Intelligents',
      createdAt: '2026-09-24T11:00:00Z',
    },
  ],
  [
    'usr-candidat-admis',
    {
      id: 'usr-candidat-admis',
      email: 'salma.elfassi@usmba.ac.ma',
      firstName: 'Salma',
      lastName: 'El Fassi',
      cin: 'CD908123',
      cne: 'N132456789',
      phone: '+212 6 64 55 66 77',
      establishmentId: 'fsdm',
      roles: ['candidat'],
      currentRole: 'candidat',
      isActive: true,
      isEmailVerified: true,
      studentOriginType: 'interne_usmba',
      originEstablishment: 'Faculté des Sciences Dhar El Mahraz (USMBA - Fès)',
      masterSpecialty: 'Réseaux, Systèmes et Sécurité Informatique',
      createdAt: '2026-09-16T14:00:00Z',
    },
  ],
  [
    'usr-chercheur-1',
    {
      id: 'usr-chercheur-1',
      email: 'abdelhafid.elalaoui@usmba.ac.ma',
      firstName: 'Abdelhafid',
      lastName: 'El Alaoui',
      cin: 'C102938',
      phone: '+212 5 35 60 80 10',
      establishmentId: 'fsdm',
      laboratoryId: 'lisac',
      roles: ['enseignant_chercheur'],
      currentRole: 'enseignant_chercheur',
      isActive: true,
      isEmailVerified: true,
      createdAt: '2020-01-10T09:00:00Z',
    },
  ],
  [
    'usr-labo-1',
    {
      id: 'usr-labo-1',
      email: 'fatimazahra.bencheikh@usmba.ac.ma',
      firstName: 'Fatima-Zahra',
      lastName: 'Bencheikh',
      cin: 'C987123',
      phone: '+212 5 35 60 80 12',
      establishmentId: 'ensa',
      laboratoryId: 'lerma',
      roles: ['responsable_labo'],
      currentRole: 'responsable_labo',
      isActive: true,
      isEmailVerified: true,
      createdAt: '2019-06-15T11:00:00Z',
    },
  ],
  [
    'usr-admin-1',
    {
      id: 'usr-admin-1',
      email: 'administration.scolarite@usmba.ac.ma',
      firstName: 'Karim',
      lastName: 'Mansouri',
      cin: 'C456789',
      phone: '+212 5 35 60 99 00',
      establishmentId: 'fsdm',
      roles: ['administration'],
      currentRole: 'administration',
      isActive: true,
      isEmailVerified: true,
      createdAt: '2018-09-01T08:00:00Z',
    },
  ],
  [
    'usr-formation-1',
    {
      id: 'usr-formation-1',
      email: 'formation.doctorale@usmba.ac.ma',
      firstName: 'Mustapha',
      lastName: 'El Ouazzani',
      cin: 'C223344',
      phone: '+212 5 35 60 70 80',
      establishmentId: 'fsdm',
      roles: ['responsable_formation'],
      currentRole: 'responsable_formation',
      isActive: true,
      isEmailVerified: true,
      createdAt: '2019-02-14T14:00:00Z',
    },
  ],
  [
    'usr-jury-1',
    {
      id: 'usr-jury-1',
      email: 'jury.informatique@usmba.ac.ma',
      firstName: 'Rachid',
      lastName: 'Choukri',
      cin: 'C556677',
      phone: '+212 6 62 11 22 33',
      establishmentId: 'fsdm',
      roles: ['jury'],
      currentRole: 'jury',
      isActive: true,
      isEmailVerified: true,
      createdAt: '2021-03-10T10:00:00Z',
    },
  ],
  [
    'usr-doctorant-1',
    {
      id: 'usr-doctorant-1',
      email: 'yassine.bennani@usmba.ac.ma',
      firstName: 'Yassine',
      lastName: 'Bennani',
      cin: 'CD554433',
      cne: 'N130099881',
      phone: '+212 6 63 99 88 77',
      establishmentId: 'fsdm',
      laboratoryId: 'lisac',
      roles: ['doctorant'],
      currentRole: 'doctorant',
      isActive: true,
      isEmailVerified: true,
      createdAt: '2024-10-01T08:00:00Z',
    },
  ],
  [
    'usr-directeur-1',
    {
      id: 'usr-directeur-1',
      email: 'directeur.these@usmba.ac.ma',
      firstName: 'Mohammed',
      lastName: 'Zouhair',
      cin: 'C334455',
      phone: '+212 5 35 60 85 90',
      establishmentId: 'fsdm',
      laboratoryId: 'lim',
      roles: ['directeur_these'],
      currentRole: 'directeur_these',
      isActive: true,
      isEmailVerified: true,
      createdAt: '2017-09-01T08:00:00Z',
    },
  ],
  [
    'usr-superadmin-1',
    {
      id: 'usr-superadmin-1',
      email: 'superadmin.gcd@usmba.ac.ma',
      firstName: 'Driss',
      lastName: 'Tahiri',
      cin: 'C112233',
      phone: '+212 5 35 60 99 99',
      establishmentId: 'fsdm',
      roles: ['responsable_gcd'],
      currentRole: 'responsable_gcd',
      isActive: true,
      isEmailVerified: true,
      createdAt: '2016-01-01T08:00:00Z',
    },
  ],
]);

interface StoredDocumentFile {
  id: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string;
  docType?: string;
  uploadedAt: string;
}

const serverDocuments = new Map<string, StoredDocumentFile>();
const serverAppDocumentBlobs = new Map<string, { fileName: string; mimeType: string; dataUrl: string }>();

function registerAppDocBlob(appId: string, docId: string, fileName: string, dataUrl: string) {
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
  serverAppDocumentBlobs.set(`${appId}:${docId}`, {
    fileName,
    mimeType: mimeMatch ? mimeMatch[1] : 'application/pdf',
    dataUrl,
  });
}

// Seed protected PDF blobs for all 6 demonstration scenarios + admitted candidate
registerAppDocBlob('app-001', 'doc-1', 'CIN_CD654321_Kenza_Benali.pdf', createServerDemoPdfDataUrl('CIN Kenza Benali (Simulation)', ['CIN : CD654321 | CNE : N134098765', 'FSDM USMBA Fes']));
registerAppDocBlob('app-001', 'doc-2', 'APOGEE_DEMO_Baccalaureat_N134098765.pdf', createServerDemoPdfDataUrl('Baccalaureat (Simulation APOGEE)', ['Etudiante : Kenza BENALI', 'CNE : N134098765 | Mention Tres Bien']));
registerAppDocBlob('app-001', 'doc-3', 'APOGEE_DEMO_Licence_SMI_N134098765.pdf', createServerDemoPdfDataUrl('Licence SMI FSDM (Simulation)', ['Etudiante : Kenza BENALI', 'Licence Sciences Mathematiques et Informatique']));
registerAppDocBlob('app-001', 'doc-4', 'APOGEE_DEMO_Attestation_Master_IDSI.pdf', createServerDemoPdfDataUrl('Master IDSI FSDM (Simulation)', ['Etudiante : Kenza BENALI', 'Master IDSI - Mention Tres Bien']));
registerAppDocBlob('app-001', 'doc-5', 'APOGEE_DEMO_Releves_S1_S4_Certifies.pdf', createServerDemoPdfDataUrl('Releves S1-S4 (Simulation)', [
  ['Etudiante : Kenza BENALI - Cursus Master IDSI', 'Semestre 1 : 16.40 / 20 - Mention Tres Bien', 'Semestre 2 : 16.85 / 20 - Mention Tres Bien'],
  ['Etudiante : Kenza BENALI - Cursus Master IDSI', 'Semestre 3 : 17.10 / 20 - Mention Tres Bien', 'Semestre 4 (PFE) : 17.60 / 20 - Mention Tres Bien'],
]));
registerAppDocBlob('app-001', 'doc-6', 'CV_Kenza_Benali_2026.pdf', createServerDemoPdfDataUrl('CV Kenza Benali (Simulation)', ['Master IDSI FSDM', 'Vision par Ordinateur & Deep Learning']));
registerAppDocBlob('app-001', 'doc-7', 'Lettre_Motivation_Kenza.pdf', createServerDemoPdfDataUrl('Lettre de Motivation (Simulation)', ['Objet : Candidature Doctorat LISAC', 'Encadrant : Pr. Abdelhafid El Alaoui']));
registerAppDocBlob('app-001', 'doc-8', 'Projet_Recherche_Vision_Olivier.pdf', createServerDemoPdfDataUrl('Avant-Projet de These (Simulation)', ['Architectures Deep Learning pour cultures d olivier', 'Laboratoire LISAC - FSDM USMBA']));
registerAppDocBlob('app-001', 'doc-9', 'Attestation_Non_Travail_Kenza.pdf', createServerDemoPdfDataUrl('Attestation de Non Travail (Simulation)', ['Declare sur l honneur : Kenza BENALI', 'CIN : CD654321']));

registerAppDocBlob('app-002', 'doc-21', 'CIN_CD712390_Youssef_Berrada.pdf', createServerDemoPdfDataUrl('CIN Youssef Berrada (Simulation)', ['CIN : CD712390', 'CNE : N138129845']));
registerAppDocBlob('app-002', 'doc-22', 'APOGEE_DEMO_Bac_N138129845.pdf', createServerDemoPdfDataUrl('Baccalaureat Youssef (Simulation)', ['CNE : N138129845']));
registerAppDocBlob('app-002', 'doc-23', 'APOGEE_DEMO_Licence_N138129845.pdf', createServerDemoPdfDataUrl('Licence ENSA Youssef (Simulation)', ['ENSA Fes - USMBA']));
registerAppDocBlob('app-002', 'doc-24', 'Master_Youssef_Berrada_ENSA.pdf', createServerDemoPdfDataUrl('Master ENSA Youssef (Simulation)', ['Genie Energetique et Systemes Solaires']));
registerAppDocBlob('app-002', 'doc-25', 'Releves_Youssef_Berrada_S1_S4.pdf', createServerDemoPdfDataUrl('Releves S1-S4 Youssef (Simulation)', ['ENSA Fes - S1 a S4 : 15.60 / 20']));
registerAppDocBlob('app-002', 'doc-26', 'CV_Youssef_Berrada.pdf', createServerDemoPdfDataUrl('CV Youssef Berrada (Simulation)', ['Genie Energetique - ENSA Fes']));
registerAppDocBlob('app-002', 'doc-27', 'Motivation_Youssef_Berrada.pdf', createServerDemoPdfDataUrl('Lettre Motivation Youssef (Simulation)', ['Labo LERMA - ENSA Fes']));
registerAppDocBlob('app-002', 'doc-28', 'Projet_Materiaux_Solaires.pdf', createServerDemoPdfDataUrl('Projet Solaire LERMA (Simulation)', ['Materiaux a changement de phase']));
registerAppDocBlob('app-002', 'doc-2a', 'Recommandation_LERMA_Youssef.pdf', createServerDemoPdfDataUrl('Lettre Recommandation LERMA (Simulation)', ['Recommande pour LERMA ENSA Fes']));

registerAppDocBlob('app-003', 'doc-31', 'CIN_CD823451_Amine_Tazi.pdf', createServerDemoPdfDataUrl('CIN Amine Tazi (Simulation)', ['CIN : CD823451 | CNE : N139445566']));
registerAppDocBlob('app-003', 'doc-32', 'APOGEE_DEMO_Bac_N139445566.pdf', createServerDemoPdfDataUrl('Baccalaureat Amine Tazi (Simulation)', ['CNE : N139445566']));
registerAppDocBlob('app-003', 'doc-33', 'APOGEE_DEMO_Licence_N139445566.pdf', createServerDemoPdfDataUrl('Licence Amine Tazi (Simulation)', ['FSDM USMBA']));
registerAppDocBlob('app-003', 'doc-34', 'APOGEE_DEMO_Master_N139445566.pdf', createServerDemoPdfDataUrl('Master Amine Tazi (Simulation)', ['Reseaux et Securite Informatique']));
registerAppDocBlob('app-003', 'doc-35', 'Releves_S1_S4_Amine_Scan.pdf', createServerDemoPdfDataUrl('Releves S1-S4 Amine (Piece Rejetee)', ['ANOMALIE : Scan S4 illisible sans cachet officiel']));
registerAppDocBlob('app-003', 'doc-36', 'CV_Amine_Tazi.pdf', createServerDemoPdfDataUrl('CV Amine Tazi (Simulation)', ['FSDM USMBA']));
registerAppDocBlob('app-003', 'doc-37', 'Lettre_Motivation_Amine.pdf', createServerDemoPdfDataUrl('Lettre Motivation Amine (Simulation)', ['Laboratoire LIM FSDM']));
registerAppDocBlob('app-003', 'doc-38', 'Projet_ZeroTrust_Amine.pdf', createServerDemoPdfDataUrl('Projet ZeroTrust Amine (Simulation)', ['Protocoles Post-Quantiques']));
registerAppDocBlob('app-003', 'doc-39', 'Attestation_Non_Travail_Amine.pdf', createServerDemoPdfDataUrl('Attestation Non Travail Amine (Simulation)', ['CIN : CD823451']));

registerAppDocBlob('app-004', 'doc-41', 'CIN_BE849201_Nadia_Chraibi_Demo.pdf', createServerDemoPdfDataUrl('CIN Nadia Chraibi (Simulation)', ['CIN : BE849201 | Candidate Externe UH2C']));
registerAppDocBlob('app-004', 'doc-42', 'Baccalaureat_Nadia_Chraibi_Demo.pdf', createServerDemoPdfDataUrl('Baccalaureat Nadia Chraibi (Simulation)', ['Sciences Mathematiques A - Mention Bien']));
registerAppDocBlob('app-004', 'doc-43', 'Diplome_Licence_UH2C_Demo.pdf', createServerDemoPdfDataUrl('Licence SMI UH2C (Simulation)', ['Universite Hassan II de Casablanca']));
registerAppDocBlob('app-004', 'doc-44', 'Diplome_Master_UH2C_Chraibi_Demo.pdf', createServerDemoPdfDataUrl('Master GLSD UH2C (Simulation)', ['Mention : Tres Bien']));
registerAppDocBlob('app-004', 'doc-45', 'Releves_Notes_S1_S4_UH2C_Demo.pdf', createServerDemoPdfDataUrl('Releves S1-S4 UH2C (Simulation)', ['Candidate : Nadia CHRAIBI | CNE : R145029384']));
registerAppDocBlob('app-004', 'doc-46', 'CV_Nadia_Chraibi_Demo.pdf', createServerDemoPdfDataUrl('CV Nadia Chraibi (Simulation)', ['UH2C Casablanca']));
registerAppDocBlob('app-004', 'doc-47', 'Lettre_Motivation_PQC_Chraibi_Demo.pdf', createServerDemoPdfDataUrl('Lettre Motivation PQC (Simulation)', ['Laboratoire LIM - FSDM USMBA']));
registerAppDocBlob('app-004', 'doc-48', 'Avant_Projet_PQC_ZeroTrust_Demo.pdf', createServerDemoPdfDataUrl('Avant-Projet PQC Zero-Trust (Simulation)', ['Cryptographie Post-Quantique Hospitaliere']));
registerAppDocBlob('app-004', 'doc-49', 'Attestation_Non_Travail_Chraibi_Demo.pdf', createServerDemoPdfDataUrl('Attestation Non Travail Nadia (Simulation)', ['CIN : BE849201']));

registerAppDocBlob('app-005', 'doc-51', 'CIN_AE519204_Tarik_ElMansouri.pdf', createServerDemoPdfDataUrl('CIN Tarik El Mansouri (Simulation)', ['CIN : AE519204 | Candidat Externe UCA']));
registerAppDocBlob('app-005', 'doc-52', 'Baccalaureat_Tarik_ElMansouri.pdf', createServerDemoPdfDataUrl('Baccalaureat Tarik El Mansouri (Simulation)', ['Academie Marrakech-Safi']));
registerAppDocBlob('app-005', 'doc-53', 'Licence_UCA_Tarik_ElMansouri.pdf', createServerDemoPdfDataUrl('Licence UCA Tarik (Simulation)', ['Faculte des Sciences Semlalia Marrakech']));
registerAppDocBlob('app-005', 'doc-56', 'CV_Tarik_ElMansouri.pdf', createServerDemoPdfDataUrl('CV Tarik El Mansouri (Simulation)', ['UCA Marrakech']));
registerAppDocBlob('app-005', 'doc-57', 'Lettre_Motivation_Tarik.pdf', createServerDemoPdfDataUrl('Lettre Motivation Tarik (Simulation)', ['Sujet Smart Grids LISAC']));
registerAppDocBlob('app-005', 'doc-58', 'Projet_SmartGrids_Tarik.pdf', createServerDemoPdfDataUrl('Projet Smart Grids Tarik (Simulation)', ['Systemes Multi-Agents Explicables']));

registerAppDocBlob('app-006a', 'doc-6a-1', 'CIN_CD781234_Imane_Bennani.pdf', createServerDemoPdfDataUrl('CIN Imane Bennani (Simulation)', ['CIN : CD781234 | CNE : N136778899']));
registerAppDocBlob('app-006a', 'doc-6a-2', 'APOGEE_DEMO_Bac_N136778899.pdf', createServerDemoPdfDataUrl('Baccalaureat Imane Bennani (Simulation)', ['CNE : N136778899']));
registerAppDocBlob('app-006a', 'doc-6a-3', 'APOGEE_DEMO_Licence_N136778899.pdf', createServerDemoPdfDataUrl('Licence Imane Bennani (Simulation)', ['FSDM USMBA']));
registerAppDocBlob('app-006a', 'doc-6a-4', 'APOGEE_DEMO_Master_N136778899.pdf', createServerDemoPdfDataUrl('Master SDSI Imane Bennani (Simulation)', ['FSDM USMBA']));
registerAppDocBlob('app-006a', 'doc-6a-5', 'APOGEE_DEMO_Releves_N136778899.pdf', createServerDemoPdfDataUrl('Releves S1-S4 Imane Bennani (Simulation)', ['Moyenne : 16.55 / 20']));
registerAppDocBlob('app-006a', 'doc-6a-6', 'CV_Imane_Bennani_2026.pdf', createServerDemoPdfDataUrl('CV Imane Bennani (Simulation)', ['FSDM USMBA']));
registerAppDocBlob('app-006a', 'doc-6a-7', 'Motivation_Imane_LISAC.pdf', createServerDemoPdfDataUrl('Lettre Motivation Imane LISAC (Simulation)', ['Sujet suj-001 LISAC']));
registerAppDocBlob('app-006a', 'doc-6a-8', 'Projet_Vision_Imane.pdf', createServerDemoPdfDataUrl('Projet Vision Imane (Simulation)', ['Vision par ordinateur LISAC']));
registerAppDocBlob('app-006a', 'doc-6a-9', 'Attestation_Non_Travail_Imane.pdf', createServerDemoPdfDataUrl('Attestation Non Travail Imane (Simulation)', ['CIN : CD781234']));
registerAppDocBlob('app-006b', 'doc-6b-7', 'Motivation_Imane_LERMA.pdf', createServerDemoPdfDataUrl('Lettre Motivation Imane LERMA (Simulation)', ['Sujet suj-002 LERMA']));
registerAppDocBlob('app-006b', 'doc-6b-8', 'Projet_Modelisation_Thermique_Imane.pdf', createServerDemoPdfDataUrl('Projet Modelisation Imane (Simulation)', ['Materiaux a changement de phase']));

registerAppDocBlob('app-adm-001', 'doc-adm-1', 'CIN_Salma.pdf', createServerDemoPdfDataUrl('CIN Salma El Fassi (Simulation)', ['CIN : CD908123']));
registerAppDocBlob('app-adm-001', 'doc-adm-2', 'Bac_Salma.pdf', createServerDemoPdfDataUrl('Bac Salma (Simulation)', ['CNE : N132456789']));
registerAppDocBlob('app-adm-001', 'doc-adm-3', 'Licence_Salma.pdf', createServerDemoPdfDataUrl('Licence Salma (Simulation)', ['FSDM USMBA']));
registerAppDocBlob('app-adm-001', 'doc-adm-4', 'Master_Salma.pdf', createServerDemoPdfDataUrl('Master Salma (Simulation)', ['Reseaux et Securite']));
registerAppDocBlob('app-adm-001', 'doc-adm-5', 'Releves_Salma.pdf', createServerDemoPdfDataUrl('Releves Salma (Simulation)', ['Mention Tres Bien']));
registerAppDocBlob('app-adm-001', 'doc-adm-6', 'CV_Salma.pdf', createServerDemoPdfDataUrl('CV Salma El Fassi (Simulation)', ['FSDM USMBA']));
registerAppDocBlob('app-adm-001', 'doc-adm-7', 'Motivation_Salma.pdf', createServerDemoPdfDataUrl('Lettre Motivation Salma (Simulation)', ['LIM FSDM']));
registerAppDocBlob('app-adm-001', 'doc-adm-8', 'Projet_PostQuantique.pdf', createServerDemoPdfDataUrl('Projet Post-Quantique (Simulation)', ['LIM FSDM']));
registerAppDocBlob('app-adm-001', 'doc-adm-9', 'NonTravail_Salma.pdf', createServerDemoPdfDataUrl('Attestation non travail Salma (Simulation)', ['CIN : CD908123']));

const serverApplications = new Map<string, any>([
  [
    'app-001',
    {
      id: 'app-001',
      referenceNumber: 'USMBA-DOC-2026-7842',
      candidateId: 'usr-candidat-1',
      candidateEmail: 'kenza.benali@usmba.ac.ma',
      cin: 'CD654321',
      cne: 'N134098765',
      studentOriginType: 'interne_usmba',
      subjectId: 'suj-001',
      laboratoryId: 'lisac',
      supervisorId: 'usr-chercheur-1',
      supervisorName: 'Pr. Abdelhafid EL ALAOUI',
      status: 'entretien_programme',
      documents: [
        { id: 'doc-1', type: 'cin', label: "Carte d'Identité Nationale (CIN)", fileName: 'CIN_CD654321_Kenza_Benali.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-2', type: 'bac', label: 'Diplôme du Baccalauréat', fileName: 'APOGEE_DEMO_Baccalaureat_N134098765.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-3', type: 'licence', label: 'Diplôme de Licence ou équivalent', fileName: 'APOGEE_DEMO_Licence_SMI_N134098765.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-4', type: 'master', label: 'Diplôme de Master ou Attestation de Réussite', fileName: 'APOGEE_DEMO_Attestation_Master_IDSI.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-5', type: 'releves_notes', label: "Relevés de notes de l'ensemble du cursus (S1 à S4)", fileName: 'APOGEE_DEMO_Releves_S1_S4_Certifies.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-6', type: 'cv', label: 'Curriculum Vitae détaillé', fileName: 'CV_Kenza_Benali_2026.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-7', type: 'lettre_motivation', label: 'Lettre de motivation', fileName: 'Lettre_Motivation_Kenza.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-8', type: 'projet_recherche', label: 'Avant-projet de recherche de thèse', fileName: 'Projet_Recherche_Vision_Olivier.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-9', type: 'attestation_non_travail', label: 'Attestation de non travail', fileName: 'Attestation_Non_Travail_Kenza.pdf', status: 'valide', provenance: 'fourni_candidat' },
      ],
    },
  ],
  [
    'app-002',
    {
      id: 'app-002',
      referenceNumber: 'USMBA-DOC-2026-5120',
      candidateId: 'usr-candidat-2',
      candidateEmail: 'youssef.berrada@usmba.ac.ma',
      cin: 'CD712390',
      cne: 'N138129845',
      studentOriginType: 'interne_usmba',
      subjectId: 'suj-002',
      laboratoryId: 'lerma',
      supervisorId: 'usr-labo-1',
      supervisorName: 'Pr. Fatima-Zahra BENCHEIKH',
      status: 'incomplete',
      documents: [
        { id: 'doc-21', type: 'cin', label: "Carte d'Identité Nationale (CIN)", fileName: 'CIN_CD712390_Youssef_Berrada.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-22', type: 'bac', label: 'Diplôme du Baccalauréat', fileName: 'APOGEE_DEMO_Bac_N138129845.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-23', type: 'licence', label: 'Diplôme de Licence ou équivalent', fileName: 'APOGEE_DEMO_Licence_N138129845.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-24', type: 'master', label: 'Diplôme de Master ou Attestation de Réussite', fileName: 'Master_Youssef_Berrada_ENSA.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-25', type: 'releves_notes', label: "Relevés de notes de l'ensemble du cursus (S1 à S4)", fileName: 'Releves_Youssef_Berrada_S1_S4.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-26', type: 'cv', label: 'Curriculum Vitae détaillé', fileName: 'CV_Youssef_Berrada.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-27', type: 'lettre_motivation', label: 'Lettre de motivation', fileName: 'Motivation_Youssef_Berrada.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-28', type: 'projet_recherche', label: 'Avant-projet de recherche de thèse', fileName: 'Projet_Materiaux_Solaires.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-2a', type: 'lettre_recommandation', label: 'Lettre de recommandation académique (spécifique LERMA)', fileName: 'Recommandation_LERMA_Youssef.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-29', type: 'attestation_non_travail', label: 'Attestation de non travail (ou justificatif de statut)', fileName: '', status: 'manquant', provenance: 'fourni_candidat', rejectionReason: 'Pièce manquante obligatoire : veuillez téléverser votre attestation de non-travail pour finaliser la recevabilité du dossier.' },
      ],
    },
  ],
  [
    'app-003',
    {
      id: 'app-003',
      referenceNumber: 'USMBA-DOC-2026-6214',
      candidateId: 'usr-candidat-3',
      candidateEmail: 'amine.tazi@usmba.ac.ma',
      cin: 'CD823451',
      cne: 'N139445566',
      studentOriginType: 'interne_usmba',
      subjectId: 'suj-003',
      laboratoryId: 'lim',
      supervisorId: 'usr-directeur-1',
      supervisorName: 'Pr. Mohammed ZOUHAIR',
      status: 'correction_demandee',
      documents: [
        { id: 'doc-31', type: 'cin', label: "Carte d'Identité Nationale (CIN)", fileName: 'CIN_CD823451_Amine_Tazi.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-32', type: 'bac', label: 'Diplôme du Baccalauréat', fileName: 'APOGEE_DEMO_Bac_N139445566.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-33', type: 'licence', label: 'Diplôme de Licence ou équivalent', fileName: 'APOGEE_DEMO_Licence_N139445566.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-34', type: 'master', label: 'Diplôme de Master ou Attestation de Réussite', fileName: 'APOGEE_DEMO_Master_N139445566.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-35', type: 'releves_notes', label: "Relevés de notes de l'ensemble du cursus (S1 à S4)", fileName: 'Releves_S1_S4_Amine_Scan.pdf', status: 'rejete', provenance: 'fourni_candidat', rejectionReason: "Le relevé de notes du semestre S4 est illisible et ne comporte pas le cachet officiel de la scolarité." },
        { id: 'doc-36', type: 'cv', label: 'Curriculum Vitae détaillé', fileName: 'CV_Amine_Tazi.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-37', type: 'lettre_motivation', label: 'Lettre de motivation', fileName: 'Lettre_Motivation_Amine.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-38', type: 'projet_recherche', label: 'Avant-projet de recherche de thèse', fileName: 'Projet_ZeroTrust_Amine.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-39', type: 'attestation_non_travail', label: 'Attestation de non travail', fileName: 'Attestation_Non_Travail_Amine.pdf', status: 'valide', provenance: 'fourni_candidat' },
      ],
    },
  ],
  [
    'app-004',
    {
      id: 'app-004',
      referenceNumber: 'USMBA-DOC-2026-8415',
      candidateId: 'usr-candidat-4',
      candidateEmail: 'nadia.chraibi@usmba.ac.ma',
      cin: 'BE849201',
      cne: 'R145029384',
      studentOriginType: 'externe',
      subjectId: 'suj-003',
      laboratoryId: 'lim',
      supervisorId: 'usr-directeur-1',
      supervisorName: 'Pr. Mohammed ZOUHAIR',
      status: 'soumise',
      documents: [
        { id: 'doc-41', type: 'cin', label: "Carte d'Identité Nationale (CIN)", fileName: 'CIN_BE849201_Nadia_Chraibi_Demo.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-42', type: 'bac', label: 'Diplôme du Baccalauréat', fileName: 'Baccalaureat_Nadia_Chraibi_Demo.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-43', type: 'licence', label: 'Diplôme de Licence ou équivalent', fileName: 'Diplome_Licence_UH2C_Demo.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-44', type: 'master', label: "Diplôme de Master ou Diplôme d'Ingénieur", fileName: 'Diplome_Master_UH2C_Chraibi_Demo.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-45', type: 'releves_notes', label: "Relevés de notes de l'ensemble du cursus (S1 à S4)", fileName: 'Releves_Notes_S1_S4_UH2C_Demo.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-46', type: 'cv', label: 'Curriculum Vitae détaillé', fileName: 'CV_Nadia_Chraibi_Demo.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-47', type: 'lettre_motivation', label: 'Lettre de motivation argumentée', fileName: 'Lettre_Motivation_PQC_Chraibi_Demo.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-48', type: 'projet_recherche', label: 'Avant-projet de recherche de thèse', fileName: 'Avant_Projet_PQC_ZeroTrust_Demo.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-49', type: 'attestation_non_travail', label: "Attestation de non travail ou autorisation de l'employeur", fileName: 'Attestation_Non_Travail_Chraibi_Demo.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
      ],
    },
  ],
  [
    'app-005',
    {
      id: 'app-005',
      referenceNumber: 'USMBA-DOC-2026-4390',
      candidateId: 'usr-candidat-5',
      candidateEmail: 'tarik.elmansouri@usmba.ac.ma',
      cin: 'AE519204',
      cne: 'M142087612',
      studentOriginType: 'externe',
      subjectId: 'suj-006',
      laboratoryId: 'lisac',
      supervisorId: 'usr-chercheur-1',
      supervisorName: 'Pr. Abdelhafid EL ALAOUI',
      status: 'incomplete',
      documents: [
        { id: 'doc-51', type: 'cin', label: "Carte d'Identité Nationale (CIN)", fileName: 'CIN_AE519204_Tarik_ElMansouri.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-52', type: 'bac', label: 'Diplôme du Baccalauréat', fileName: 'Baccalaureat_Tarik_ElMansouri.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-53', type: 'licence', label: 'Diplôme de Licence ou équivalent', fileName: 'Licence_UCA_Tarik_ElMansouri.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-54', type: 'master', label: "Diplôme de Master ou Diplôme d'Ingénieur", fileName: '', status: 'manquant', provenance: 'fourni_candidat' },
        { id: 'doc-55', type: 'releves_notes', label: "Relevés de notes de l'ensemble du cursus (S1 à S4)", fileName: '', status: 'manquant', provenance: 'fourni_candidat' },
        { id: 'doc-56', type: 'cv', label: 'Curriculum Vitae détaillé', fileName: 'CV_Tarik_ElMansouri.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-57', type: 'lettre_motivation', label: 'Lettre de motivation', fileName: 'Lettre_Motivation_Tarik.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-58', type: 'projet_recherche', label: 'Avant-projet de recherche de thèse', fileName: 'Projet_SmartGrids_Tarik.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-59', type: 'attestation_non_travail', label: 'Attestation de non travail', fileName: '', status: 'manquant', provenance: 'fourni_candidat' },
        { id: 'doc-5a', type: 'lettre_recommandation', label: 'Lettre de recommandation ou attestation axe Smart Grids (spécifique LISAC)', fileName: '', status: 'manquant', provenance: 'fourni_candidat' },
      ],
    },
  ],
  [
    'app-006a',
    {
      id: 'app-006a',
      referenceNumber: 'USMBA-DOC-2026-9101',
      candidateId: 'usr-candidat-6',
      candidateEmail: 'imane.bennani@usmba.ac.ma',
      cin: 'CD781234',
      cne: 'N136778899',
      studentOriginType: 'interne_usmba',
      subjectId: 'suj-001',
      laboratoryId: 'lisac',
      supervisorId: 'usr-chercheur-1',
      supervisorName: 'Pr. Abdelhafid EL ALAOUI',
      status: 'recevable',
      documents: [
        { id: 'doc-6a-1', type: 'cin', label: "Carte d'Identité Nationale (CIN)", fileName: 'CIN_CD781234_Imane_Bennani.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-6a-2', type: 'bac', label: 'Diplôme du Baccalauréat', fileName: 'APOGEE_DEMO_Bac_N136778899.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-6a-3', type: 'licence', label: 'Diplôme de Licence ou équivalent', fileName: 'APOGEE_DEMO_Licence_N136778899.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-6a-4', type: 'master', label: 'Diplôme de Master ou Attestation de Réussite', fileName: 'APOGEE_DEMO_Master_N136778899.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-6a-5', type: 'releves_notes', label: "Relevés de notes de l'ensemble du cursus (S1 à S4)", fileName: 'APOGEE_DEMO_Releves_N136778899.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-6a-6', type: 'cv', label: 'Curriculum Vitae détaillé', fileName: 'CV_Imane_Bennani_2026.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-6a-7', type: 'lettre_motivation', label: 'Lettre de motivation', fileName: 'Motivation_Imane_LISAC.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-6a-8', type: 'projet_recherche', label: 'Avant-projet de recherche de thèse', fileName: 'Projet_Vision_Imane.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-6a-9', type: 'attestation_non_travail', label: 'Attestation de non travail', fileName: 'Attestation_Non_Travail_Imane.pdf', status: 'valide', provenance: 'fourni_candidat' },
      ],
    },
  ],
  [
    'app-006b',
    {
      id: 'app-006b',
      referenceNumber: 'USMBA-DOC-2026-9102',
      candidateId: 'usr-candidat-6',
      candidateEmail: 'imane.bennani@usmba.ac.ma',
      cin: 'CD781234',
      cne: 'N136778899',
      studentOriginType: 'interne_usmba',
      subjectId: 'suj-002',
      laboratoryId: 'lerma',
      supervisorId: 'usr-labo-1',
      supervisorName: 'Pr. Fatima-Zahra BENCHEIKH',
      status: 'incomplete',
      documents: [
        { id: 'doc-6b-1', type: 'cin', label: "Carte d'Identité Nationale (CIN)", fileName: 'CIN_CD781234_Imane_Bennani.pdf', fileUrl: '/api/applications/app-006a/documents/doc-6a-1/content', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-6b-2', type: 'bac', label: 'Diplôme du Baccalauréat', fileName: 'APOGEE_DEMO_Bac_N136778899.pdf', fileUrl: '/api/applications/app-006a/documents/doc-6a-2/content', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-6b-3', type: 'licence', label: 'Diplôme de Licence ou équivalent', fileName: 'APOGEE_DEMO_Licence_N136778899.pdf', fileUrl: '/api/applications/app-006a/documents/doc-6a-3/content', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-6b-4', type: 'master', label: 'Diplôme de Master ou Attestation de Réussite', fileName: 'APOGEE_DEMO_Master_N136778899.pdf', fileUrl: '/api/applications/app-006a/documents/doc-6a-4/content', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-6b-5', type: 'releves_notes', label: "Relevés de notes de l'ensemble du cursus (S1 à S4)", fileName: 'APOGEE_DEMO_Releves_N136778899.pdf', fileUrl: '/api/applications/app-006a/documents/doc-6a-5/content', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-6b-6', type: 'cv', label: 'Curriculum Vitae détaillé', fileName: 'CV_Imane_Bennani_2026.pdf', fileUrl: '/api/applications/app-006a/documents/doc-6a-6/content', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-6b-9', type: 'attestation_non_travail', label: 'Attestation de non travail', fileName: 'Attestation_Non_Travail_Imane.pdf', fileUrl: '/api/applications/app-006a/documents/doc-6a-9/content', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-6b-7', type: 'lettre_motivation', label: 'Lettre de motivation', fileName: 'Motivation_Imane_LERMA.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-6b-8', type: 'projet_recherche', label: 'Avant-projet de recherche de thèse', fileName: 'Projet_Modelisation_Thermique_Imane.pdf', status: 'en_attente', provenance: 'fourni_candidat' },
        { id: 'doc-6b-rec', type: 'lettre_recommandation', label: 'Lettre de recommandation académique (spécifique LERMA)', fileName: '', status: 'manquant', provenance: 'fourni_candidat' },
      ],
    },
  ],
  [
    'app-adm-001',
    {
      id: 'app-adm-001',
      referenceNumber: 'USMBA-DOC-2026-9041',
      candidateId: 'usr-candidat-admis',
      candidateEmail: 'salma.elfassi@usmba.ac.ma',
      cin: 'CD908123',
      cne: 'N132456789',
      studentOriginType: 'interne_usmba',
      subjectId: 'suj-003',
      laboratoryId: 'lim',
      supervisorId: 'usr-directeur-1',
      supervisorName: 'Pr. Mohammed ZOUHAIR',
      status: 'admise',
      documents: [
        { id: 'doc-adm-1', type: 'cin', label: "Carte d'Identité Nationale (CIN)", fileName: 'CIN_Salma.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-adm-2', type: 'bac', label: 'Baccalauréat', fileName: 'Bac_Salma.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-adm-3', type: 'licence', label: 'Diplôme de Licence', fileName: 'Licence_Salma.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-adm-4', type: 'master', label: 'Diplôme de Master', fileName: 'Master_Salma.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-adm-5', type: 'releves_notes', label: 'Relevés de notes', fileName: 'Releves_Salma.pdf', status: 'valide', provenance: 'recupere_administration', isDemoApogee: true },
        { id: 'doc-adm-6', type: 'cv', label: 'Curriculum Vitae', fileName: 'CV_Salma.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-adm-7', type: 'lettre_motivation', label: 'Lettre de motivation', fileName: 'Motivation_Salma.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-adm-8', type: 'projet_recherche', label: 'Projet de recherche', fileName: 'Projet_PostQuantique.pdf', status: 'valide', provenance: 'fourni_candidat' },
        { id: 'doc-adm-9', type: 'attestation_non_travail', label: 'Attestation de non travail', fileName: 'NonTravail_Salma.pdf', status: 'valide', provenance: 'fourni_candidat' },
      ],
    },
  ],
]);

// Seed protected Registration & Re-registration document stores
const serverRegistrations = new Map<string, any>([
  [
    'reg-001',
    {
      id: 'reg-001',
      candidateId: 'usr-candidat-admis',
      cin: 'CD908123',
      laboratoryId: 'lim',
      supervisorName: 'Pr. Mohammed ZOUHAIR',
      documents: {
        'rd-1': { fileName: 'Originaux_Diplomes_Certifies.pdf', mimeType: 'application/pdf', dataUrl: createServerDemoPdfDataUrl('Originaux des Diplomes Certifies (Simulation)', ['Doctorante : Salma EL FASSI', 'CIN : CD908123 | CNE : N132456789']) },
        'rd-2': { fileName: 'Charte_Theses_Signee.pdf', mimeType: 'application/pdf', dataUrl: createServerDemoPdfDataUrl('Charte des Theses USMBA (Simulation)', ['Signee par Salma EL FASSI et Pr. M. ZOUHAIR']) },
        'rd-3': { fileName: 'Photos_Identite.png', mimeType: 'image/png', dataUrl: createServerDemoPngDataUrl() },
        'rd-4': { fileName: 'Attestation_Assurance_2026.pdf', mimeType: 'application/pdf', dataUrl: createServerDemoPdfDataUrl('Attestation Assurance Etudiante (Simulation)', ['Annee universitaire 2026-2027']) },
        'rd-5': { fileName: 'Engagement_Reglement.pdf', mimeType: 'application/pdf', dataUrl: createServerDemoPdfDataUrl('Engagement Reglement Interieur (Simulation)', ['CEDoc USMBA Fes']) },
      },
    },
  ],
]);

const serverReRegistrations = new Map<string, any>([
  [
    're-reg-001',
    {
      id: 're-reg-001',
      studentId: 'usr-doctorant-1',
      cin: 'CD554433',
      laboratoryId: 'lisac',
      supervisorId: 'usr-chercheur-1',
      supervisorName: 'Pr. Abdelhafid EL ALAOUI',
      documents: {
        'rrd-1': { fileName: 'Rapport_Avancement_An3_Yassine.pdf', mimeType: 'application/pdf', dataUrl: createServerDemoPdfDataUrl('Rapport Avancement An 3 - Yassine Bennani', [['Chapitre 1 & 2 finalises - Apprentissage Federe IoT'], ['Chapitre 3 en cours - Publication IEEE ISCC 2026']]) },
        'rrd-2': { fileName: 'Avis_Directeur_EnAttente.pdf', mimeType: 'application/pdf', dataUrl: createServerDemoPdfDataUrl('Formulaire Avis Directeur (Demo)', ['Doctorant : Yassine Bennani', 'Encadrant : Pr. Abdelhafid El Alaoui']) },
        'rrd-3': { fileName: 'Attestation_Formations_CEDoc.pdf', mimeType: 'application/pdf', dataUrl: createServerDemoPdfDataUrl('Attestation 140h Formations CEDoc (Demo)', ['Total cumule : 140h / 200h']) },
        'rrd-4': { fileName: 'Recu_Assurance_2026.pdf', mimeType: 'application/pdf', dataUrl: createServerDemoPdfDataUrl('Recu Assurance Doctorant 2026-2027', ['Yassine Bennani - CIN CD554433']) },
      },
    },
  ],
  [
    're-reg-002',
    {
      id: 're-reg-002',
      studentId: 'usr-doctorant-2',
      cin: 'CD667788',
      laboratoryId: 'lisac',
      supervisorId: 'usr-chercheur-1',
      supervisorName: 'Pr. Abdelhafid EL ALAOUI',
      documents: {
        'rrd-21': { fileName: 'Rapport_Avancement_An2_Othmane.pdf', mimeType: 'application/pdf', dataUrl: createServerDemoPdfDataUrl('Rapport Avancement An 2 - Othmane El Amrani', ['Validation protocoles LoRaWAN', 'Soumission IEEE Sensors']) },
        'rrd-22': { fileName: 'Attestation_90h_CEDoc.pdf', mimeType: 'application/pdf', dataUrl: createServerDemoPdfDataUrl('Attestation 90h Formations CEDoc', ['Othmane El Amrani - 2e Annee']) },
      },
    },
  ],
  [
    're-reg-003',
    {
      id: 're-reg-003',
      studentId: 'usr-doctorant-3',
      cin: 'CD889911',
      laboratoryId: 'lim',
      supervisorId: 'usr-directeur-1',
      supervisorName: 'Pr. Mohammed ZOUHAIR',
      documents: {
        'rrd-31': { fileName: 'Rapport_An4_Imane.pdf', mimeType: 'application/pdf', dataUrl: createServerDemoPdfDataUrl('Rapport Avancement An 4 - Imane Tlemcani', ['Manuscrit finalise chapitres 1 a 4']) },
        'rrd-32': { fileName: 'Attestation_210h_CEDoc.pdf', mimeType: 'application/pdf', dataUrl: createServerDemoPdfDataUrl('Attestation 210h Formations CEDoc', ['Seuil 200h atteint - Pret pour soutenance']) },
      },
    },
  ],
]);

function findServerUserByEmail(email: string): ServerUser | undefined {
  const target = email.trim().toLowerCase();
  for (const user of serverUsers.values()) {
    if (user.email.toLowerCase() === target) return user;
  }
  return undefined;
}

function findServerUserByGoogleId(googleId: string): ServerUser | undefined {
  if (!googleId) return undefined;
  for (const user of serverUsers.values()) {
    if (user.googleId && user.googleId === googleId) return user;
  }
  return undefined;
}

function findOrLinkUserForVerifiedGoogle(identity: VerifiedGoogleIdentity): ServerUser | undefined {
  const byGoogleId = findServerUserByGoogleId(identity.googleId);
  if (byGoogleId) return byGoogleId;

  const byEmail = findServerUserByEmail(identity.email);
  if (byEmail) {
    byEmail.googleId = identity.googleId;
    byEmail.googleLinkedAt = new Date().toISOString();
    byEmail.isEmailVerified = true;
    serverUsers.set(byEmail.id, byEmail);
    return byEmail;
  }
  return undefined;
}

function serializePublicUser(u: ServerUser) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    cin: u.cin,
    cne: u.cne,
    phone: u.phone,
    establishmentId: u.establishmentId,
    laboratoryId: u.laboratoryId,
    roles: u.roles,
    currentRole: u.currentRole,
    isActive: u.isActive,
    isEmailVerified: u.isEmailVerified,
    googleId: u.googleId,
    googleLinkedAt: u.googleLinkedAt,
    studentOriginType: u.studentOriginType,
    originEstablishment: u.originEstablishment,
    masterSpecialty: u.masterSpecialty,
    createdAt: u.createdAt,
  };
}

const STAFF_ROLES = new Set([
  'administration',
  'enseignant_chercheur',
  'responsable_labo',
  'responsable_formation',
  'jury',
  'directeur_these',
  'responsable_gcd',
]);

interface AuthenticatedRequest extends Request {
  authSession?: SessionPayload;
  authUser?: ServerUser;
}

function extractSession(req: Request): SessionPayload | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const verified = verifySessionToken(authHeader.slice(7).trim());
    if (verified) return verified;
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME]) {
    return verifySessionToken(cookies[SESSION_COOKIE_NAME]);
  }
  return null;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const usingBearer = Boolean(authHeader && authHeader.startsWith('Bearer '));
  const session = extractSession(req);
  if (!session) {
    return res.status(401).json({
      success: false,
      message: 'Authentification requise. Veuillez vous connecter avec votre compte Google (@usmba.ac.ma).',
    });
  }

  // Verify Origin matches Host/X-Forwarded-Host on cookie-authenticated state-changing requests
  if (!usingBearer && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    const origin = req.headers.origin;
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        const expectedHost = String(req.get('x-forwarded-host') || req.get('host') || '');
        if (expectedHost && originHost !== expectedHost) {
          return res.status(403).json({
            success: false,
            message: 'Requête refusée : origine non autorisée.',
          });
        }
      } catch {
        return res.status(403).json({
          success: false,
          message: 'Requête refusée : en-tête Origin invalide.',
        });
      }
    }
  }

  const user = serverUsers.get(session.userId);
  if (!user || !user.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Session expirée ou compte désactivé.',
    });
  }
  if (!isStrictUsmbaDomain(user.email)) {
    return res.status(403).json({
      success: false,
      errorCode: 'DOMAIN_DENIED',
      message: DOMAIN_DENIED_MESSAGE,
    });
  }
  req.authSession = session;
  req.authUser = user;
  next();
}

function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser || !req.authSession) {
      return res.status(401).json({ success: false, message: 'Authentification requise.' });
    }
    const activeRole = req.authSession.currentRole || req.authUser.currentRole;
    const hasRole = allowedRoles.includes(activeRole) && req.authUser.roles.includes(activeRole);
    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé : vous ne disposez pas des droits nécessaires pour cette ressource.',
      });
    }
    next();
  };
}

/**
 * Helper to validate DataURL (images OR PDF)
 */
function parseDocumentDataUrl(dataUrl: string): { mimeType: string; cleanBase64: string; sizeKb: number } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+_-]+|application\/pdf);base64,(.+)$/s);
  if (!match) return null;
  const mimeType = match[1];
  const cleanBase64 = match[2].replace(/\s+/g, '');
  const sizeKb = Math.round((cleanBase64.length * 0.75) / 1024);
  return { mimeType, cleanBase64, sizeKb };
}

/**
 * Resilient multi-model Gemini OCR caller with active supported models
 */
async function callGeminiOcrWithFallback(
  parts: any[],
  docKind: string
): Promise<{ data: any; modelUsed: string; durationMs: number; rawText: string }> {
  if (!ai) {
    throw new Error('Client Google GenAI non initialisé (clé API manquante).');
  }

  const models = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
  let lastError: any = null;

  for (const model of models) {
    const startTime = Date.now();
    try {
      console.log(`[OCR Gemini] (${docKind}) Tentative avec le modèle : ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const durationMs = Date.now() - startTime;
      const textOutput = response.text || '{}';
      const cleaned = cleanJsonString(textOutput);
      const parsedRaw = JSON.parse(cleaned);
      const dataObj = Array.isArray(parsedRaw) ? parsedRaw[0] : parsedRaw;

      console.log(`[OCR Gemini Succès] (${docKind}) Modèle: ${model} (${durationMs}ms)`);
      return {
        data: dataObj,
        modelUsed: model,
        durationMs,
        rawText: dataObj?.rawText || textOutput,
      };
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[OCR Gemini Avertissement] (${docKind}) Modèle ${model} en échec (${err?.status || err?.message?.slice(0, 80)}).`
      );
    }
  }

  throw lastError || new Error('Tous les modèles Gemini OCR ont échoué.');
}

/**
 * POST /api/ocr/cin
 * Extracts CIN fields from Moroccan National ID card (image or PDF) without hallucination
 */
app.post('/api/ocr/cin', async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ success: false, message: 'Aucun document transmis pour l\'OCR CIN.' });
    }

    const parsedUrl = parseDocumentDataUrl(imageBase64);
    if (!parsedUrl) {
      return res.status(400).json({
        success: false,
        errorType: 'unsupported_format',
        message: 'Format de fichier non pris en charge. Utilisez JPG, PNG, WebP ou PDF.',
      });
    }

    const { mimeType, cleanBase64, sizeKb } = parsedUrl;
    console.log(`[OCR CIN] Requête reçue — Taille: ${sizeKb} KB, Format: ${mimeType}`);

    if (!ai) {
      return res.json({
        success: false,
        errorType: 'ocr_not_configured',
        message:
          'Le moteur OCR automatique Gemini n\'est pas configuré sur le serveur (GEMINI_API_KEY manquante). Vous pouvez remplir le formulaire manuellement.',
        data: {
          cin: '',
          lastName: '',
          firstName: '',
          birthDate: '',
          birthPlace: '',
          nationality: '',
          cardValidUntil: '',
          rawText: '',
        },
        missingFields: ['cin', 'lastName', 'firstName', 'birthDate', 'birthPlace', 'nationality'],
      });
    }

    try {
      const parts = [
        {
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        },
        {
          text: `Tu es un système expert d'extraction OCR de haute précision spécialisé dans les Cartes Nationales d'Identité (CIN) marocaines (français et arabe : « المملكة المغربية », « البطاقة الوطنية للتعريف »).

RÈGLE ABSOLUE DE ZÉRO HALLUCINATION :
- Extrais EXCLUSIVEMENT les caractères réellement visibles et lisibles sur le document fourni.
- Si un champ est absent, coupé, flou ou illisible, laisse STRICTEMENT une chaîne vide "" (ne devine JAMAIS une nationalité, une date, un nom ou un numéro).
- N'invente aucune information d'exemple.

Champs JSON attendus :
{
  "isValidDocument": true si c'est une CIN lisible sinon false,
  "cin": "Numéro alphanumérique CIN exact ou ''",
  "lastName": "NOM DE FAMILLE en majuscules latines tel que lu ou ''",
  "firstName": "Prénom en lettres latines tel que lu ou ''",
  "birthDate": "Date de naissance lue (ex: JJ/MM/AAAA) ou ''",
  "birthPlace": "Lieu de naissance lu ou ''",
  "nationality": "Nationalité explicitement écrite sur le document ou ''",
  "cardValidUntil": "Date d'expiration lue ou ''",
  "confidenceScore": nombre entre 0.0 et 1.0,
  "rawText": "Texte brut intégral détecté"
}`,
        },
      ];

      const { data: parsed, modelUsed, durationMs, rawText } = await callGeminiOcrWithFallback(parts, 'CIN');

      const cin = String(parsed.cin || parsed.CIN || parsed.numCin || parsed.numeroCin || '').trim().toUpperCase();
      const lastName = String(parsed.lastName || parsed.nom || parsed.familyName || '').trim().toUpperCase();
      const firstName = String(parsed.firstName || parsed.prenom || parsed.givenName || '').trim();
      const birthDate = String(parsed.birthDate || parsed.dateNaissance || parsed.date_naissance || '').trim();
      const birthPlace = String(parsed.birthPlace || parsed.lieuNaissance || parsed.lieu_naissance || '').trim();
      const nationality = String(parsed.nationality || parsed.nationalite || '').trim();
      const cardValidUntil = String(parsed.cardValidUntil || parsed.validite || '').trim();
      const isValid = parsed.isValidDocument !== false && (!!cin || !!lastName || !!firstName);

      const missingFields: string[] = [];
      if (!cin) missingFields.push('cin');
      if (!lastName) missingFields.push('lastName');
      if (!firstName) missingFields.push('firstName');
      if (!birthDate) missingFields.push('birthDate');
      if (!nationality) missingFields.push('nationality');

      console.log(
        `[OCR CIN Succès] Modèle: ${modelUsed} — CIN: ${maskSensitiveData(cin)}, Nom: ${maskSensitiveData(lastName)}, Valide: ${isValid}`
      );

      return res.json({
        success: true,
        isValidDocument: isValid,
        missingFields,
        data: {
          cin,
          lastName,
          firstName,
          birthDate,
          birthPlace,
          nationality,
          cardValidUntil,
          rawText: rawText || '',
        },
        diagnostic: {
          modelUsed,
          imageSizeKb: sizeKb,
          durationMs,
          confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : isValid ? 0.9 : 0.3,
          rawTextExcerpt: rawText ? rawText.slice(0, 200) : '',
        },
      });
    } catch (err: any) {
      console.warn('[OCR CIN Erreur] Fallback saisie manuelle:', err?.message);
      return res.json({
        success: false,
        errorType: 'ocr_service_unavailable',
        message: 'Le service OCR a rencontré une erreur ou le document est illisible. Vous pouvez réessayer avec un document plus net ou saisir vos informations manuellement.',
        data: {
          cin: '',
          lastName: '',
          firstName: '',
          birthDate: '',
          birthPlace: '',
          nationality: '',
          cardValidUntil: '',
          rawText: '',
        },
        missingFields: ['cin', 'lastName', 'firstName', 'birthDate', 'nationality'],
        diagnostic: { imageSizeKb: sizeKb, errorMsg: err?.message },
      });
    }
  } catch (error: any) {
    console.error('OCR CIN error:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors du traitement OCR de la CIN.' });
  }
});

/**
 * POST /api/ocr/student-card
 * Extracts academic fields from Moroccan Student Card / Attestation (image or PDF) without hallucination
 */
app.post('/api/ocr/student-card', async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ success: false, message: 'Aucun document transmis pour l\'OCR carte d\'étudiant.' });
    }

    const parsedUrl = parseDocumentDataUrl(imageBase64);
    if (!parsedUrl) {
      return res.status(400).json({
        success: false,
        errorType: 'unsupported_format',
        message: 'Format non pris en charge. Utilisez JPG, PNG, WebP ou PDF.',
      });
    }

    const { mimeType, cleanBase64, sizeKb } = parsedUrl;
    console.log(`[OCR Carte-Étudiant] Requête reçue — Taille: ${sizeKb} KB, Format: ${mimeType}`);

    if (!ai) {
      return res.json({
        success: false,
        errorType: 'ocr_not_configured',
        message:
          'Le moteur OCR automatique Gemini n\'est pas configuré sur le serveur (GEMINI_API_KEY manquante). Veuillez saisir manuellement vos informations étudiantes.',
        data: {
          cne: '',
          massarCode: '',
          studentFullName: '',
          lastName: '',
          firstName: '',
          originEstablishment: '',
          masterSpecialty: '',
          academicYear: '',
          rawText: '',
        },
        missingFields: ['cne', 'studentFullName', 'originEstablishment', 'masterSpecialty'],
      });
    }

    try {
      const parts = [
        {
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        },
        {
          text: `Tu es un système expert d'extraction OCR spécialisé dans les Cartes d'Étudiants universitaires marocaines et Attestations d'Inscription / Réussite (USMBA de Fès et autres universités marocaines/étrangères).

RÈGLE ABSOLUE DE ZÉRO HALLUCINATION :
- Extrais UNIQUEMENT les informations réellement lisibles et visibles sur le document.
- Si un champ (ex: filière, année universitaire, CNE) n'apparaît pas clairement ou est illisible, renvoie STRICTEMENT une chaîne vide "". Ne devine jamais et ne complète jamais avec des valeurs supposées.

Schéma JSON attendu :
{
  "isValidDocument": true si carte d'étudiant ou attestation académique lisible sinon false,
  "cne": "Code CNE / Massar / N° Apogée ou N° Étudiant exact lu ou ''",
  "massarCode": "Code Massar lu si distinct ou ''",
  "studentFullName": "Nom et prénom complets lus ou ''",
  "lastName": "Nom lu ou ''",
  "firstName": "Prénom lu ou ''",
  "originEstablishment": "Nom exact de l'établissement ou université lu ou ''",
  "masterSpecialty": "Filière / Spécialité / Diplôme explicitement inscrit ou ''",
  "academicYear": "Année universitaire inscrite ou ''",
  "confidenceScore": nombre entre 0.0 et 1.0,
  "rawText": "Lignes de texte brut réellement lues"
}`,
        },
      ];

      const { data: parsed, modelUsed, durationMs, rawText } = await callGeminiOcrWithFallback(parts, 'Carte-Étudiant');

      const cne = String(
        parsed.cne || parsed.CNE || parsed.massarCode || parsed.codeMassar || parsed.studentNumber || parsed.apogeeCode || ''
      )
        .trim()
        .toUpperCase();
      const massarCode = String(parsed.massarCode || cne || '').trim().toUpperCase();
      const lastName = String(parsed.lastName || '').trim().toUpperCase();
      const firstName = String(parsed.firstName || '').trim();
      const studentFullName = String(
        parsed.studentFullName || parsed.nomComplet || (lastName || firstName ? `${lastName} ${firstName}`.trim() : '')
      ).trim();
      const originEstablishment = String(parsed.originEstablishment || parsed.etablissement || parsed.faculte || '').trim();
      const masterSpecialty = String(parsed.masterSpecialty || parsed.filiere || parsed.specialite || '').trim();
      const academicYear = String(parsed.academicYear || parsed.anneeUniversitaire || '').trim();
      const isValid = parsed.isValidDocument !== false && (!!cne || !!studentFullName || !!originEstablishment);

      const missingFields: string[] = [];
      if (!cne) missingFields.push('cne');
      if (!studentFullName) missingFields.push('studentFullName');
      if (!originEstablishment) missingFields.push('originEstablishment');
      if (!masterSpecialty) missingFields.push('masterSpecialty');

      console.log(
        `[OCR Carte-Étudiant Succès] Modèle: ${modelUsed} — CNE: ${maskSensitiveData(cne)}, Nom: ${maskSensitiveData(studentFullName)}, Étab: ${originEstablishment || 'Non détecté'}`
      );

      return res.json({
        success: true,
        isValidDocument: isValid,
        missingFields,
        data: {
          cne,
          massarCode,
          studentFullName,
          lastName,
          firstName,
          originEstablishment,
          masterSpecialty,
          academicYear,
          rawText: rawText || '',
        },
        diagnostic: {
          modelUsed,
          imageSizeKb: sizeKb,
          durationMs,
          confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : isValid ? 0.9 : 0.3,
          rawTextExcerpt: rawText ? rawText.slice(0, 200) : '',
        },
      });
    } catch (err: any) {
      console.warn('[OCR Carte-Étudiant Erreur] Fallback saisie manuelle:', err?.message);
      return res.json({
        success: false,
        errorType: 'ocr_service_unavailable',
        message: 'Le service OCR n\'a pas pu analyser le document. Vérifiez sa lisibilité ou saisissez vos données manuellement.',
        data: {
          cne: '',
          massarCode: '',
          studentFullName: '',
          lastName: '',
          firstName: '',
          originEstablishment: '',
          masterSpecialty: '',
          academicYear: '',
          rawText: '',
        },
        missingFields: ['cne', 'studentFullName', 'originEstablishment', 'masterSpecialty'],
        diagnostic: { imageSizeKb: sizeKb, errorMsg: err?.message },
      });
    }
  } catch (error: any) {
    console.error('OCR Student card error:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors du traitement OCR de la carte d\'étudiant.' });
  }
});

/**
 * GET /api/auth/google/config
 * Exposes safe public Google OAuth configuration & honest diagnostics (NEVER exposes GOOGLE_CLIENT_SECRET)
 */
app.get('/api/auth/google/config', (req: Request, res: Response) => {
  const serverClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const viteClientId = (process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const effectiveClientId = serverClientId || viteClientId;
  const hasClientSecret = Boolean((process.env.GOOGLE_CLIENT_SECRET || '').trim());

  const jsOrigin = getAppBaseUrl(req);
  const redirectUri = getOAuthRedirectUri(req);
  const oauthCodeFlowEnabled = Boolean(effectiveClientId && hasClientSecret);

  return res.json({
    configured: true,
    simulationMode: true,
    simulationLabel: 'Mode démonstration académique',
    oauthCodeFlowEnabled,
    oauthPopupEnabled: oauthCodeFlowEnabled,
    hasClientId: true,
    allowedDomain: ALLOWED_GOOGLE_DOMAIN,
    jsOrigin,
    redirectUri,
    promptMode: 'select_account',
  });
});

/**
 * POST /api/auth/google/simulate
 * Academic demonstration Google account selector simulation endpoint.
 * Strictly enforces @usmba.ac.ma domain and rejects @gmail.com or external domains.
 */
app.post('/api/auth/google/simulate', (req: Request, res: Response) => {
  const { email, name, givenName, familyName } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({
      success: false,
      errorCode: 'INVALID_EMAIL',
      message: 'Veuillez saisir une adresse e-mail valide pour la simulation.',
    });
  }

  if (!isStrictUsmbaDomain(cleanEmail)) {
    return res.status(403).json({
      success: false,
      errorCode: 'DOMAIN_DENIED',
      message: DOMAIN_DENIED_MESSAGE,
    });
  }

  const emailLocal = cleanEmail.split('@')[0] || 'candidat';
  const derivedParts = emailLocal.split(/[._-]+/).filter(Boolean);
  const fallbackFirst = derivedParts[0]
    ? derivedParts[0].charAt(0).toUpperCase() + derivedParts[0].slice(1)
    : 'Nouveau';
  const fallbackLast = derivedParts[1]
    ? derivedParts[1].toUpperCase()
    : 'CANDIDAT';

  const identity: VerifiedGoogleIdentity = {
    googleId: `sim-google-${crypto.createHash('sha256').update(cleanEmail).digest('hex').slice(0, 14)}`,
    email: cleanEmail,
    hd: ALLOWED_GOOGLE_DOMAIN,
    name: String(name || `${givenName || fallbackFirst} ${familyName || fallbackLast}`.trim()),
    givenName: String(givenName || fallbackFirst),
    familyName: String(familyName || fallbackLast),
    photoUrl: '',
    emailVerified: true,
  };

  const existingUser = findOrLinkUserForVerifiedGoogle(identity);
  if (existingUser) {
    if (!existingUser.isActive) {
      return res.status(403).json({
        success: false,
        errorCode: 'ACCOUNT_DISABLED',
        message: "Votre compte a été temporairement désactivé par l'administration.",
      });
    }

    const sessionToken = setSessionCookie(req, res, {
      userId: existingUser.id,
      email: existingUser.email,
      currentRole: existingUser.currentRole,
      roles: existingUser.roles,
    });

    return res.json({
      success: true,
      simulationMode: true,
      accountExists: true,
      existingUser: serializePublicUser(existingUser),
      sessionToken,
      user: {
        ...identity,
        verifiedEmail: true,
      },
    });
  }

  const onboardingToken = setOnboardingCookie(req, res, identity);
  return res.json({
    success: true,
    simulationMode: true,
    accountExists: false,
    onboardingToken,
    user: {
      ...identity,
      verifiedEmail: true,
    },
    message: 'Compte académique simulé @usmba.ac.ma vérifié. Complétez maintenant votre profil candidat.',
  });
});

/**
 * GET /api/auth/google/url
 * Constructs the Google OAuth 2.0 Authorization Code URL with prompt=select_account & hd=usmba.ac.ma
 */
app.get('/api/auth/google/url', (req: Request, res: Response) => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    const missing: string[] = [];
    if (!clientId) missing.push('GOOGLE_CLIENT_ID');
    if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
    return res.status(503).json({
      success: false,
      errorCode: 'OAUTH_NOT_CONFIGURED',
      missingVars: missing,
      message: `Configuration Google OAuth incomplète sur le serveur (${missing.join(', ')} manquant(s)).`,
    });
  }

  pruneExpiredOAuthMaps();

  const redirectUri = getOAuthRedirectUri(req);
  const mode = req.query.mode === 'register' ? 'register' : 'login';
  let openerOrigin = getAppBaseUrl(req);
  const requestedOrigin = String(req.query.origin || '').trim();
  if (requestedOrigin) {
    try {
      const parsedOrigin = new URL(requestedOrigin);
      if (parsedOrigin.protocol === 'https:' || parsedOrigin.protocol === 'http:') {
        openerOrigin = parsedOrigin.origin;
      }
    } catch {
      // Ignore malformed origin query param
    }
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  pendingOAuthStates.set(nonce, {
    nonce,
    mode,
    redirectUri,
    openerOrigin,
    exp: Date.now() + 1000 * 60 * 10,
  });

  const stateToken = signTokenPayload({
    kind: 'oauth_state',
    nonce,
    mode,
    exp: Date.now() + 1000 * 60 * 10,
  });

  res.cookie(OAUTH_STATE_COOKIE_NAME, nonce, getAuthCookieOptions(req, 1000 * 60 * 10));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    hd: ALLOWED_GOOGLE_DOMAIN,
    prompt: 'select_account',
    state: stateToken,
  });

  return res.json({
    success: true,
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    redirectUri,
  });
});

/**
 * GET /auth/google/callback
 * Exchanges Google OAuth code for tokens using server-only GOOGLE_CLIENT_SECRET,
 * verifies id_token + email_verified=true + hd/domain === usmba.ac.ma,
 * creates a single-use iframe-safe exchangeCode, and notifies opener via postMessage.
 */
async function handleGoogleOAuthCallback(req: Request, res: Response) {
  let targetOpenerOrigin = '*';
  const sendPopupMessage = (payload: Record<string, any>) => {
    const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
    const safeOrigin = JSON.stringify(targetOpenerOrigin).replace(/</g, '\\u003c');
    return res.send(`<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><title>Authentification Google — GCD USMBA</title></head>
  <body style="font-family:sans-serif;padding:24px;text-align:center;color:#0f172a;">
    <p>${payload.type === 'GOOGLE_OAUTH_ERROR' ? 'Authentification refusée.' : 'Authentification vérifiée.'} Cette fenêtre va se fermer automatiquement.</p>
    <script>
      (function () {
        var msg = ${safeJson};
        var origin = ${safeOrigin};
        if (window.opener) {
          try {
            window.opener.postMessage(msg, origin);
          } catch (e) {
            window.opener.postMessage(msg, '*');
          }
          window.close();
        } else {
          var q = msg.exchangeCode
            ? '?oauth_code=' + encodeURIComponent(msg.exchangeCode)
            : msg.message
            ? '?oauth_error=' + encodeURIComponent(msg.message)
            : '';
          window.location.href = '/login' + q;
        }
      })();
    </script>
  </body>
</html>`);
  };

  try {
    pruneExpiredOAuthMaps();

    const stateRaw = String(req.query.state || '');
    const statePayload = verifyTokenPayload<{ kind: string; nonce: string; mode: string; exp: number }>(stateRaw);
    const savedState = statePayload?.nonce ? pendingOAuthStates.get(statePayload.nonce) : undefined;
    if (savedState) {
      targetOpenerOrigin = savedState.openerOrigin || '*';
      pendingOAuthStates.delete(statePayload!.nonce);
    }

    const oauthError = String(req.query.error || '');
    if (oauthError) {
      return sendPopupMessage({
        type: 'GOOGLE_OAUTH_ERROR',
        errorCode: 'GOOGLE_CANCELLED',
        message: 'L\'authentification Google a été annulée ou refusée.',
      });
    }

    const code = String(req.query.code || '');
    const cookies = parseCookies(req.headers.cookie);

    if (!code || !statePayload || statePayload.kind !== 'oauth_state' || !savedState || savedState.exp <= Date.now()) {
      return sendPopupMessage({
        type: 'GOOGLE_OAUTH_ERROR',
        errorCode: 'INVALID_STATE',
        message: 'Session OAuth invalide ou expirée. Veuillez réessayer.',
      });
    }

    if (cookies[OAUTH_STATE_COOKIE_NAME] && cookies[OAUTH_STATE_COOKIE_NAME] !== statePayload.nonce) {
      return sendPopupMessage({
        type: 'GOOGLE_OAUTH_ERROR',
        errorCode: 'STATE_MISMATCH',
        message: 'Vérification de sécurité OAuth échouée (state mismatch).',
      });
    }
    const clearOpts = getAuthCookieOptions(req, 0);
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, {
      path: '/',
      sameSite: clearOpts.sameSite,
      secure: clearOpts.secure,
      partitioned: clearOpts.partitioned,
    } as any);

    const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) {
      return sendPopupMessage({
        type: 'GOOGLE_OAUTH_ERROR',
        errorCode: 'OAUTH_NOT_CONFIGURED',
        message: 'Variables GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET absentes sur le serveur.',
      });
    }

    const redirectUri = savedState.redirectUri || getOAuthRedirectUri(req);

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenJson: any = await tokenResp.json();
    if (!tokenResp.ok || !tokenJson.id_token) {
      return sendPopupMessage({
        type: 'GOOGLE_OAUTH_ERROR',
        errorCode: 'TOKEN_EXCHANGE_FAILED',
        message: 'Impossible d\'échanger le code d\'autorisation Google (vérifiez redirect_uri et client_secret).',
      });
    }

    const verification = await verifyGoogleIdTokenStrict(String(tokenJson.id_token));
    if (verification.ok === false) {
      return sendPopupMessage({
        type: 'GOOGLE_OAUTH_ERROR',
        errorCode: verification.errorCode,
        message: verification.message,
      });
    }

    const { identity } = verification;
    const existingUser = findOrLinkUserForVerifiedGoogle(identity);

    if (existingUser && !existingUser.isActive) {
      return sendPopupMessage({
        type: 'GOOGLE_OAUTH_ERROR',
        errorCode: 'ACCOUNT_DISABLED',
        message: 'Votre compte a été temporairement désactivé par l\'administration.',
      });
    }

    const exchangeCode = crypto.randomBytes(24).toString('hex');
    pendingOAuthExchanges.set(exchangeCode, {
      accountExists: Boolean(existingUser),
      existingUser,
      identity,
      exp: Date.now() + 1000 * 90,
    });

    if (existingUser) {
      setSessionCookie(req, res, {
        userId: existingUser.id,
        email: existingUser.email,
        currentRole: existingUser.currentRole,
        roles: existingUser.roles,
      });
      return sendPopupMessage({
        type: 'GOOGLE_OAUTH_SUCCESS',
        accountExists: true,
        exchangeCode,
      });
    }

    setOnboardingCookie(req, res, identity);
    return sendPopupMessage({
      type: 'GOOGLE_OAUTH_SUCCESS',
      accountExists: false,
      exchangeCode,
    });
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return sendPopupMessage({
      type: 'GOOGLE_OAUTH_ERROR',
      errorCode: 'CALLBACK_ERROR',
      message: 'Erreur interne lors de l\'authentification Google.',
    });
  }
}

app.get(['/auth/google/callback', '/auth/google/callback/'], handleGoogleOAuthCallback);

/**
 * POST /api/auth/google/exchange
 * Exchanges a single-use server-issued exchangeCode (received via postMessage from the OAuth popup)
 * so the app inside the cross-origin iframe receives the verified session/onboarding token & cookies.
 */
app.post('/api/auth/google/exchange', (req: Request, res: Response) => {
  pruneExpiredOAuthMaps();
  const exchangeCode = String(req.body?.exchangeCode || '').trim();
  if (!exchangeCode) {
    return res.status(400).json({
      success: false,
      errorCode: 'MISSING_EXCHANGE_CODE',
      message: 'Code d\'échange OAuth manquant.',
    });
  }

  const record = pendingOAuthExchanges.get(exchangeCode);
  if (!record || record.exp <= Date.now()) {
    pendingOAuthExchanges.delete(exchangeCode);
    return res.status(401).json({
      success: false,
      errorCode: 'EXCHANGE_EXPIRED',
      message: 'Session d\'authentification Google expirée. Veuillez réessayer.',
    });
  }

  pendingOAuthExchanges.delete(exchangeCode);

  if (record.accountExists && record.existingUser) {
    const u = record.existingUser;
    if (!u.isActive) {
      return res.status(403).json({
        success: false,
        errorCode: 'ACCOUNT_DISABLED',
        message: 'Votre compte a été temporairement désactivé par l\'administration.',
      });
    }
    const sessionToken = setSessionCookie(req, res, {
      userId: u.id,
      email: u.email,
      currentRole: u.currentRole,
      roles: u.roles,
    });

    return res.json({
      success: true,
      accountExists: true,
      existingUser: serializePublicUser(u),
      sessionToken,
      user: record.identity ? { ...record.identity, verifiedEmail: true } : undefined,
    });
  }

  if (!record.identity) {
    return res.status(401).json({
      success: false,
      errorCode: 'IDENTITY_MISSING',
      message: 'Identité Google introuvable.',
    });
  }

  const onboardingToken = setOnboardingCookie(req, res, record.identity);
  return res.json({
    success: true,
    accountExists: false,
    onboardingToken,
    user: {
      ...record.identity,
      verifiedEmail: true,
    },
    message: 'Compte Google académique vérifié. Veuillez compléter votre inscription candidat.',
  });
});

/**
 * POST /api/auth/google/verify
 * Verifies Google OAuth ID token (credential) directly with Google servers.
 * NEVER trusts client-supplied email/userInfo without a valid Google-signed token.
 * Enforces email_verified = true, hd claim (when present), and exact domain === "usmba.ac.ma".
 */
app.post('/api/auth/google/verify', async (req: Request, res: Response) => {
  try {
    const { credential } = req.body || {};

    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({
        success: false,
        errorCode: 'MISSING_GOOGLE_TOKEN',
        message:
          'Vérification impossible : aucun jeton Google OAuth valide n\'a été transmis au serveur.',
      });
    }

    const verification = await verifyGoogleIdTokenStrict(credential);
    if (verification.ok === false) {
      return res.status(verification.status).json({
        success: false,
        errorCode: verification.errorCode,
        message: verification.message,
      });
    }

    const { identity } = verification;
    const existingUser = findOrLinkUserForVerifiedGoogle(identity);

    if (existingUser) {
      if (!existingUser.isActive) {
        return res.status(403).json({
          success: false,
          errorCode: 'ACCOUNT_DISABLED',
          message: 'Votre compte a été temporairement désactivé par l\'administration.',
        });
      }

      const sessionToken = setSessionCookie(req, res, {
        userId: existingUser.id,
        email: existingUser.email,
        currentRole: existingUser.currentRole,
        roles: existingUser.roles,
      });

      return res.json({
        success: true,
        accountExists: true,
        existingUser: serializePublicUser(existingUser),
        sessionToken,
        user: {
          ...identity,
          verifiedEmail: true,
        },
      });
    }

    // Account does not exist yet -> issue signed onboarding token/cookie so candidate can register
    const onboardingToken = setOnboardingCookie(req, res, identity);

    return res.json({
      success: true,
      accountExists: false,
      onboardingToken,
      user: {
        ...identity,
        verifiedEmail: true,
      },
      message: 'Compte Google académique vérifié. Veuillez compléter votre inscription candidat.',
    });
  } catch (error: any) {
    console.error('Google auth verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Échec de la validation de l\'authentification Google.',
    });
  }
});

/**
 * GET /api/auth/google/onboarding
 * Returns the verified @usmba.ac.ma Google onboarding identity from HttpOnly cookie or Bearer onboardingToken
 */
app.get('/api/auth/google/onboarding', (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie);
  const authHeader = req.headers.authorization;
  const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const token = bearer || cookies[ONBOARDING_COOKIE_NAME];
  const onboarding = verifyTokenPayload<GoogleOnboardingPayload>(token);

  if (!onboarding || onboarding.kind !== 'google_onboarding') {
    return res.status(401).json({
      success: false,
      message: 'Aucune session d\'inscription Google vérifiée en cours.',
    });
  }

  if (!onboarding.emailVerified || !isStrictUsmbaDomain(onboarding.email)) {
    return res.status(403).json({
      success: false,
      errorCode: 'DOMAIN_DENIED',
      message: DOMAIN_DENIED_MESSAGE,
    });
  }

  return res.json({
    success: true,
    user: {
      googleId: onboarding.googleId,
      email: onboarding.email,
      name: onboarding.name,
      givenName: onboarding.givenName,
      familyName: onboarding.familyName,
      photoUrl: onboarding.photoUrl,
      verifiedEmail: true,
    },
  });
});

/**
 * POST /api/auth/register
 * Registers a candidate on the server ONLY with a server-verified @usmba.ac.ma Google identity.
 * Preserves academic origin distinction (interne_usmba vs externe) independently of @usmba.ac.ma login domain.
 */
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const {
      id,
      firstName,
      lastName,
      cin,
      cne,
      phone,
      establishmentId,
      originEstablishment,
      masterSpecialty,
      studentOriginType,
      registrationMethod,
      identityDocuments,
      googleCredential,
      onboardingToken,
    } = req.body || {};

    // Verify Google identity strictly on server (either fresh googleCredential or server-signed onboardingToken/cookie)
    let verifiedIdentity: VerifiedGoogleIdentity | null = null;

    if (googleCredential && typeof googleCredential === 'string') {
      const verification = await verifyGoogleIdTokenStrict(googleCredential);
      if (verification.ok === false) {
        return res.status(verification.status).json({
          success: false,
          errorCode: verification.errorCode,
          message: verification.message,
        });
      }
      verifiedIdentity = verification.identity;
    } else {
      const cookies = parseCookies(req.headers.cookie);
      const authHeader = req.headers.authorization;
      const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
      const rawOnboarding =
        (typeof onboardingToken === 'string' && onboardingToken) ||
        bearer ||
        cookies[ONBOARDING_COOKIE_NAME];
      const parsedOnboarding = verifyTokenPayload<GoogleOnboardingPayload>(rawOnboarding);

      if (parsedOnboarding && parsedOnboarding.kind === 'google_onboarding') {
        if (!parsedOnboarding.emailVerified || !isStrictUsmbaDomain(parsedOnboarding.email)) {
          return res.status(403).json({
            success: false,
            errorCode: 'DOMAIN_DENIED',
            message: DOMAIN_DENIED_MESSAGE,
          });
        }
        verifiedIdentity = {
          googleId: parsedOnboarding.googleId,
          email: parsedOnboarding.email.trim().toLowerCase(),
          hd: ALLOWED_GOOGLE_DOMAIN,
          name: parsedOnboarding.name,
          givenName: parsedOnboarding.givenName,
          familyName: parsedOnboarding.familyName,
          photoUrl: parsedOnboarding.photoUrl,
          emailVerified: true,
        };
      }
    }

    if (!verifiedIdentity) {
      return res.status(401).json({
        success: false,
        errorCode: 'GOOGLE_VERIFICATION_REQUIRED',
        message:
          'Authentification Google académique (@usmba.ac.ma) vérifiée requise pour créer un compte.',
      });
    }

    if (!firstName || !lastName || !cin) {
      return res.status(400).json({
        success: false,
        message: 'Champs obligatoires manquants (nom, prénom, CIN).',
      });
    }

    const cleanEmail = verifiedIdentity.email;
    const cleanCin = String(cin).trim().toUpperCase();

    if (findServerUserByEmail(cleanEmail)) {
      return res.status(409).json({
        success: false,
        message: 'Un compte avec cette adresse e-mail existe déjà.',
      });
    }

    for (const u of serverUsers.values()) {
      if (u.cin.toUpperCase() === cleanCin) {
        return res.status(409).json({
          success: false,
          message: 'Un compte avec ce numéro de CIN existe déjà.',
        });
      }
    }

    const userId = id || `usr-candidat-${Date.now()}`;
    // IMPORTANT: university origin (interne_usmba vs externe) is strictly separate from @usmba.ac.ma Google login domain
    const estLower = String(originEstablishment || '').toLowerCase();
    const detectedOrigin: 'interne_usmba' | 'externe' =
      studentOriginType === 'interne_usmba' || studentOriginType === 'externe'
        ? studentOriginType
        : estLower.includes('usmba') ||
          estLower.includes('sidi mohamed ben abdellah') ||
          estLower.includes('dhar el mahraz') ||
          estLower.includes('fsdm') ||
          estLower.includes('ensa f') ||
          estLower.includes('fsjes') ||
          estLower.includes('flsh') ||
          estLower.includes('fmpf') ||
          estLower.includes('est fès') ||
          estLower.includes('est fes')
        ? 'interne_usmba'
        : 'externe';

    const newUser: ServerUser = {
      id: userId,
      email: cleanEmail,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim().toUpperCase(),
      cin: cleanCin,
      cne: cne ? String(cne).trim().toUpperCase() : undefined,
      phone: String(phone || '').trim(),
      establishmentId: establishmentId || 'fsdm',
      roles: ['candidat'],
      currentRole: 'candidat',
      isActive: true,
      isEmailVerified: true,
      googleId: verifiedIdentity.googleId,
      googleLinkedAt: new Date().toISOString(),
      studentOriginType: detectedOrigin,
      originEstablishment: originEstablishment || '',
      masterSpecialty: masterSpecialty || '',
      registrationMethod: registrationMethod || 'manual',
      identityDocuments: identityDocuments || undefined,
      createdAt: new Date().toISOString(),
    };

    serverUsers.set(userId, newUser);
    const clearOpts = getAuthCookieOptions(req, 0);
    res.clearCookie(ONBOARDING_COOKIE_NAME, {
      path: '/',
      sameSite: clearOpts.sameSite,
      secure: clearOpts.secure,
      partitioned: clearOpts.partitioned,
    } as any);

    const sessionToken = setSessionCookie(req, res, {
      userId: newUser.id,
      email: newUser.email,
      currentRole: newUser.currentRole,
      roles: newUser.roles,
    });

    console.log(
      `[Auth Register] Compte créé — ID: ${userId}, CIN: ${maskSensitiveData(cleanCin)}, Origine: ${detectedOrigin}, Méthode: ${newUser.registrationMethod}`
    );

    return res.status(201).json({
      success: true,
      user: newUser,
      sessionToken,
    });
  } catch (err) {
    console.error('Register endpoint error:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur lors de la création du compte.' });
  }
});

/**
 * POST /api/auth/session/sync
 * Syncs active role ONLY for an already authenticated session (requires valid signed token)
 */
app.post('/api/auth/session/sync', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.authUser!;
  if (!isStrictUsmbaDomain(user.email)) {
    return res.status(403).json({ success: false, errorCode: 'DOMAIN_DENIED', message: DOMAIN_DENIED_MESSAGE });
  }
  const { requestedRole } = req.body || {};
  const activeRole = requestedRole && user.roles.includes(requestedRole) ? requestedRole : user.currentRole;
  user.currentRole = activeRole;
  const sessionToken = setSessionCookie(req, res, {
    userId: user.id,
    email: user.email,
    currentRole: activeRole,
    roles: user.roles,
  });
  return res.json({ success: true, sessionToken, currentRole: activeRole });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!req.authUser || !isStrictUsmbaDomain(req.authUser.email)) {
    return res.status(403).json({ success: false, errorCode: 'DOMAIN_DENIED', message: DOMAIN_DENIED_MESSAGE });
  }
  return res.json({ success: true, user: serializePublicUser(req.authUser) });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const opts = getAuthCookieOptions(req, 0);
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    sameSite: opts.sameSite,
    secure: opts.secure,
    partitioned: opts.partitioned,
  } as any);
  res.clearCookie(ONBOARDING_COOKIE_NAME, {
    path: '/',
    sameSite: opts.sameSite,
    secure: opts.secure,
    partitioned: opts.partitioned,
  } as any);
  return res.json({ success: true, message: 'Déconnexion effectuée.' });
});

app.post('/api/auth/switch-role', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { role } = req.body;
  const user = req.authUser!;
  if (!role || !user.roles.includes(role)) {
    return res.status(403).json({
      success: false,
      message: 'Vous ne pouvez pas activer un rôle qui n\'est pas attribué à votre compte.',
    });
  }
  user.currentRole = role;
  const sessionToken = setSessionCookie(req, res, {
    userId: user.id,
    email: user.email,
    currentRole: role,
    roles: user.roles,
  });
  return res.json({ success: true, currentRole: role, sessionToken });
});

/**
 * Protected Application Endpoints (Strict RBAC & Candidate Data Isolation)
 */
const SAFE_PREVIEW_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function setPrivateDocumentSecurityHeaders(res: Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function sanitizeSafeMimeType(mimeType: string, fileName: string): string {
  const lower = (mimeType || '').toLowerCase().trim();
  if (SAFE_PREVIEW_MIME_TYPES.has(lower)) {
    return lower === 'image/jpg' ? 'image/jpeg' : lower;
  }
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

function sendProtectedBinaryDocument(
  res: Response,
  payload: { fileName: string; mimeType: string; dataUrl: string }
) {
  setPrivateDocumentSecurityHeaders(res);
  const safeMime = sanitizeSafeMimeType(payload.mimeType, payload.fileName);
  const safeName = payload.fileName.replace(/[\r\n"\\/]/g, '_');

  if (payload.dataUrl.startsWith('data:')) {
    const base64Part = payload.dataUrl.split(',')[1] || '';
    const buf = Buffer.from(base64Part, 'base64');
    res.setHeader('Content-Type', safeMime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(safeName)}"`);
    return res.send(buf);
  }
  return res.status(404).json({ success: false, message: 'Contenu binaire indisponible.' });
}

function canUserAccessApplication(user: ServerUser, activeRole: string, appRecord: any): boolean {
  if (activeRole === 'administration' || activeRole === 'responsable_gcd') return true;
  if (activeRole === 'candidat' || activeRole === 'doctorant') {
    return (
      appRecord.candidateId === user.id ||
      (appRecord.candidateEmail && appRecord.candidateEmail.toLowerCase() === user.email.toLowerCase()) ||
      (appRecord.cin && user.cin && appRecord.cin.toUpperCase() === user.cin.toUpperCase())
    );
  }
  if (activeRole === 'responsable_labo') {
    return !user.laboratoryId || !appRecord.laboratoryId || appRecord.laboratoryId === user.laboratoryId;
  }
  if (activeRole === 'enseignant_chercheur' || activeRole === 'directeur_these') {
    return (
      appRecord.supervisorId === user.id ||
      (appRecord.supervisorName && appRecord.supervisorName.toLowerCase().includes(user.lastName.toLowerCase())) ||
      Boolean(user.laboratoryId && appRecord.laboratoryId === user.laboratoryId)
    );
  }
  if (activeRole === 'jury' || activeRole === 'responsable_formation') {
    return [
      'recevable',
      'en_cours_evaluation',
      'entretien_programme',
      'en_attente_decision',
      'admise',
      'liste_attente',
      'non_admise',
    ].includes(appRecord.status);
  }
  return false;
}

function canUserAccessRegistration(user: ServerUser, activeRole: string, regRecord: any): boolean {
  if (activeRole === 'administration' || activeRole === 'responsable_gcd') return true;
  if (activeRole === 'candidat' || activeRole === 'doctorant') {
    return (
      regRecord.candidateId === user.id ||
      (regRecord.cin && user.cin && regRecord.cin.toUpperCase() === user.cin.toUpperCase())
    );
  }
  if (activeRole === 'responsable_labo') {
    return Boolean(user.laboratoryId && regRecord.laboratoryId === user.laboratoryId);
  }
  if (activeRole === 'enseignant_chercheur' || activeRole === 'directeur_these') {
    return Boolean(regRecord.supervisorName && regRecord.supervisorName.toLowerCase().includes(user.lastName.toLowerCase()));
  }
  return false;
}

function canUserAccessReRegistration(user: ServerUser, activeRole: string, reRegRecord: any): boolean {
  if (activeRole === 'administration' || activeRole === 'responsable_gcd' || activeRole === 'responsable_formation') {
    return true;
  }
  if (activeRole === 'doctorant' || activeRole === 'candidat') {
    return (
      reRegRecord.studentId === user.id ||
      (reRegRecord.cin && user.cin && reRegRecord.cin.toUpperCase() === user.cin.toUpperCase())
    );
  }
  if (activeRole === 'enseignant_chercheur' || activeRole === 'directeur_these') {
    return (
      reRegRecord.supervisorId === user.id ||
      (reRegRecord.supervisorName && reRegRecord.supervisorName.toLowerCase().includes(user.lastName.toLowerCase()))
    );
  }
  if (activeRole === 'responsable_labo') {
    return Boolean(user.laboratoryId && reRegRecord.laboratoryId === user.laboratoryId);
  }
  return false;
}

function sanitizeApplicationForResponse(appRecord: any) {
  if (!appRecord) return appRecord;
  return {
    ...appRecord,
    documents: Array.isArray(appRecord.documents)
      ? appRecord.documents.map((d: any) => ({
          ...d,
          fileUrl:
            d.fileName && (!d.fileUrl || d.fileUrl.startsWith('data:'))
              ? `/api/applications/${appRecord.id}/documents/${d.id}/content`
              : d.fileUrl,
        }))
      : [],
  };
}

app.get('/api/applications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.authUser!;
  const activeRole = req.authSession!.currentRole || user.currentRole;
  const allApps = Array.from(serverApplications.values());
  const visibleApps = allApps
    .filter((a) => canUserAccessApplication(user, activeRole, a))
    .map(sanitizeApplicationForResponse);

  return res.json({ success: true, applications: visibleApps });
});

app.get('/api/applications/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.authUser!;
  const activeRole = req.authSession!.currentRole || user.currentRole;
  const appRecord = serverApplications.get(req.params.id);

  if (!appRecord) {
    return res.status(404).json({ success: false, message: 'Dossier introuvable.' });
  }

  if (!canUserAccessApplication(user, activeRole, appRecord)) {
    return res.status(403).json({
      success: false,
      message: 'Accès interdit : vous n’êtes pas autorisé à consulter ce dossier.',
    });
  }

  return res.json({ success: true, application: sanitizeApplicationForResponse(appRecord) });
});

app.post('/api/applications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.authUser!;
  const activeRole = req.authSession!.currentRole || user.currentRole;
  if (activeRole !== 'candidat' && !user.roles.includes('candidat')) {
    return res.status(403).json({ success: false, message: 'Seuls les candidats peuvent soumettre un dossier.' });
  }

  const application = req.body;
  if (!application || !application.id || !application.subjectId) {
    return res.status(400).json({ success: false, message: 'Données de candidature invalides.' });
  }

  // Enforce server-side owner identity & prevent duplicate subject submission
  for (const existing of serverApplications.values()) {
    if (
      existing.candidateId === user.id &&
      existing.subjectId === application.subjectId &&
      existing.id !== application.id
    ) {
      return res.status(409).json({
        success: false,
        message: 'Vous avez déjà soumis une candidature active pour ce même sujet.',
      });
    }
  }

  const sanitizedDocs = Array.isArray(application.documents)
    ? application.documents.map((d: any) => {
        if (d.fileUrl && typeof d.fileUrl === 'string' && d.fileUrl.startsWith('data:')) {
          registerAppDocBlob(application.id, d.id, d.fileName || `${d.type}.pdf`, d.fileUrl);
          return {
            ...d,
            fileUrl: `/api/applications/${application.id}/documents/${d.id}/content`,
          };
        }
        return d;
      })
    : [];

  const stored = {
    ...application,
    candidateId: user.id,
    candidateEmail: user.email,
    cin: user.cin,
    documents: sanitizedDocs,
  };
  serverApplications.set(stored.id, stored);
  return res.status(201).json({ success: true, application: sanitizeApplicationForResponse(stored) });
});

app.put('/api/applications/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.authUser!;
  const activeRole = req.authSession!.currentRole || user.currentRole;
  const existing = serverApplications.get(req.params.id);
  const incoming = req.body;

  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ success: false, message: 'Corps de requête invalide.' });
  }

  const isStaffAdmin = ['administration', 'responsable_gcd', 'responsable_formation', 'jury'].includes(activeRole);
  const isOwner = existing
    ? existing.candidateId === user.id ||
      (existing.candidateEmail && existing.candidateEmail.toLowerCase() === user.email.toLowerCase()) ||
      (existing.cin && user.cin && existing.cin.toUpperCase() === user.cin.toUpperCase())
    : incoming.candidateId === user.id ||
      (incoming.candidateEmail && String(incoming.candidateEmail).toLowerCase() === user.email.toLowerCase());

  if (!isStaffAdmin && !isOwner) {
    return res.status(403).json({
      success: false,
      message: 'Accès interdit : vous ne pouvez pas modifier ce dossier.',
    });
  }

  const targetId = req.params.id;
  const sanitizedDocs = Array.isArray(incoming.documents)
    ? incoming.documents.map((d: any) => {
        if (d.fileUrl && typeof d.fileUrl === 'string' && d.fileUrl.startsWith('data:')) {
          registerAppDocBlob(targetId, d.id, d.fileName || `${d.type}.pdf`, d.fileUrl);
          return {
            ...d,
            fileUrl: `/api/applications/${targetId}/documents/${d.id}/content`,
          };
        }
        return d;
      })
    : existing?.documents || [];

  const merged = {
    ...(existing || {}),
    ...incoming,
    id: targetId,
    candidateId: existing?.candidateId || incoming.candidateId || user.id,
    candidateEmail: existing?.candidateEmail || incoming.candidateEmail || user.email,
    cin: existing?.cin || incoming.cin || user.cin,
    documents: sanitizedDocs,
    updatedAt: new Date().toISOString(),
  };

  serverApplications.set(targetId, merged);
  return res.json({ success: true, application: sanitizeApplicationForResponse(merged) });
});

app.patch(
  '/api/applications/:id/documents/:docId',
  requireAuth,
  requireRole(['administration', 'responsable_gcd']),
  (req: AuthenticatedRequest, res: Response) => {
    const appRecord = serverApplications.get(req.params.id);
    if (!appRecord) {
      return res.status(404).json({ success: false, message: 'Dossier introuvable.' });
    }
    const { status, rejectionReason } = req.body;
    const allowedStatuses = ['en_attente', 'valide', 'rejete', 'complement_requis', 'manquant'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Statut de document invalide.' });
    }
    if (Array.isArray(appRecord.documents)) {
      appRecord.documents = appRecord.documents.map((d: any) =>
        d.id === req.params.docId ? { ...d, status, rejectionReason: rejectionReason || undefined } : d
      );
      if (status === 'rejete' || status === 'complement_requis') {
        appRecord.status = 'correction_demandee';
      }
      appRecord.updatedAt = new Date().toISOString();
      serverApplications.set(appRecord.id, appRecord);
    }
    return res.json({ success: true, application: sanitizeApplicationForResponse(appRecord) });
  }
);

/**
 * Protected Document Content Endpoints (Strict RBAC + No-Cache Headers)
 */
app.get(
  '/api/applications/:id/documents/:docId/content',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    setPrivateDocumentSecurityHeaders(res);
    const user = req.authUser!;
    const activeRole = req.authSession!.currentRole || user.currentRole;
    const appRecord = serverApplications.get(req.params.id);

    if (!appRecord) {
      return res.status(404).json({ success: false, message: 'Dossier introuvable.' });
    }

    if (!canUserAccessApplication(user, activeRole, appRecord)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé : vous n’êtes pas autorisé à consulter les pièces de ce dossier.',
      });
    }

    const docMeta = Array.isArray(appRecord.documents)
      ? appRecord.documents.find((d: any) => d.id === req.params.docId)
      : null;

    if (!docMeta) {
      return res.status(404).json({ success: false, message: 'Pièce justificative introuvable dans ce dossier.' });
    }

    const blobEntry = serverAppDocumentBlobs.get(`${appRecord.id}:${docMeta.id}`);
    if (blobEntry) {
      return sendProtectedBinaryDocument(res, blobEntry);
    }

    // Fallback to uploaded serverDocument if linked by protectedUrl
    if (typeof docMeta.fileUrl === 'string' && docMeta.fileUrl.startsWith('/api/documents/')) {
      const srvDocId = docMeta.fileUrl.replace('/api/documents/', '').split('?')[0];
      const srvDoc = serverDocuments.get(srvDocId);
      if (srvDoc) {
        return sendProtectedBinaryDocument(res, srvDoc);
      }
    }

    // Fallback to APOGÉE demo record if internal administrative document
    if (docMeta.provenance === 'recupere_administration' && appRecord.cne) {
      const apogeeMatch = DEMO_APOGEE_STUDENTS[String(appRecord.cne).toUpperCase()];
      const apogeeDoc = apogeeMatch?.availableAdministrativeDocuments?.find((ad: any) => ad.type === docMeta.type);
      if (apogeeDoc?.dataUrl) {
        return sendProtectedBinaryDocument(res, {
          fileName: apogeeDoc.fileName,
          mimeType: 'application/pdf',
          dataUrl: apogeeDoc.dataUrl,
        });
      }
    }

    return res.status(404).json({ success: false, message: 'Fichier introuvable sur le serveur.' });
  }
);

app.get(
  '/api/registrations/:id/documents/:docId/content',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    setPrivateDocumentSecurityHeaders(res);
    const user = req.authUser!;
    const activeRole = req.authSession!.currentRole || user.currentRole;
    const regRecord = serverRegistrations.get(req.params.id);

    if (!regRecord) {
      return res.status(404).json({ success: false, message: 'Dossier d’inscription introuvable.' });
    }

    if (!canUserAccessRegistration(user, activeRole, regRecord)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé : vous ne pouvez pas consulter les pièces de cette inscription.',
      });
    }

    const docBlob = regRecord.documents?.[req.params.docId];
    if (!docBlob) {
      return res.status(404).json({ success: false, message: 'Pièce d’inscription introuvable.' });
    }

    return sendProtectedBinaryDocument(res, docBlob);
  }
);

app.get(
  '/api/re-registrations/:id/documents/:docId/content',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    setPrivateDocumentSecurityHeaders(res);
    const user = req.authUser!;
    const activeRole = req.authSession!.currentRole || user.currentRole;
    const reRegRecord = serverReRegistrations.get(req.params.id);

    if (!reRegRecord) {
      return res.status(404).json({ success: false, message: 'Dossier de réinscription introuvable.' });
    }

    if (!canUserAccessReRegistration(user, activeRole, reRegRecord)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé : vous ne pouvez pas consulter ce dossier de réinscription.',
      });
    }

    const docBlob = reRegRecord.documents?.[req.params.docId];
    if (!docBlob) {
      return res.status(404).json({ success: false, message: 'Pièce de réinscription introuvable.' });
    }

    return sendProtectedBinaryDocument(res, docBlob);
  }
);

app.get(
  '/api/apogee/documents/:cne/:docType/content',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    setPrivateDocumentSecurityHeaders(res);
    const user = req.authUser!;
    const activeRole = req.authSession!.currentRole || user.currentRole;
    const cne = String(req.params.cne || '').trim().toUpperCase();
    const docType = String(req.params.docType || '').trim();

    const isOwner = Boolean(user.cne && user.cne.toUpperCase() === cne);
    const isAdminOrDirector = ['administration', 'responsable_gcd', 'responsable_formation'].includes(activeRole);
    if (!isOwner && !isAdminOrDirector) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé : cette pièce APOGÉE appartient à un autre étudiant.',
      });
    }

    const apogeeStudent = DEMO_APOGEE_STUDENTS[cne];
    const matchDoc = apogeeStudent?.availableAdministrativeDocuments?.find((d: any) => d.type === docType);
    if (!matchDoc?.dataUrl) {
      return res.status(404).json({ success: false, message: 'Pièce APOGÉE introuvable.' });
    }

    return sendProtectedBinaryDocument(res, {
      fileName: matchDoc.fileName,
      mimeType: 'application/pdf',
      dataUrl: matchDoc.dataUrl,
    });
  }
);

app.post('/api/documents/upload', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  setPrivateDocumentSecurityHeaders(res);
  const user = req.authUser!;
  const { fileName, fileSize, dataUrl, docType } = req.body;
  if (!fileName || !dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return res.status(400).json({ success: false, message: 'Fichier ou contenu manquant.' });
  }
  const safeExt = (String(fileName).split('.').pop() || '').toLowerCase();
  if (!['pdf', 'jpg', 'jpeg', 'png', 'docx'].includes(safeExt)) {
    return res.status(400).json({
      success: false,
      message: 'Format de fichier non autorisé. Formats acceptés : PDF, JPG, JPEG, PNG, DOCX.',
    });
  }
  const docId = `srvdoc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
  const resolvedMime = sanitizeSafeMimeType(mimeMatch ? mimeMatch[1] : '', String(fileName));
  const storedDoc: StoredDocumentFile = {
    id: docId,
    ownerId: user.id,
    fileName: String(fileName).replace(/[\r\n"\\/]/g, '_'),
    mimeType: resolvedMime,
    fileSize: Number(fileSize) || 0,
    dataUrl,
    docType: docType || 'other',
    uploadedAt: new Date().toISOString(),
  };
  serverDocuments.set(docId, storedDoc);
  return res.status(201).json({
    success: true,
    documentId: docId,
    protectedUrl: `/api/documents/${docId}`,
  });
});

app.get('/api/documents/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  setPrivateDocumentSecurityHeaders(res);
  const user = req.authUser!;
  const activeRole = req.authSession!.currentRole || user.currentRole;
  const doc = serverDocuments.get(req.params.id);

  if (!doc) {
    return res.status(404).json({ success: false, message: 'Document introuvable.' });
  }

  const isOwner = doc.ownerId === user.id;
  const isAdmin = activeRole === 'administration' || activeRole === 'responsable_gcd';
  let isAuthorizedStaffForLinkedApp = false;
  if (!isOwner && !isAdmin && STAFF_ROLES.has(activeRole)) {
    const protectedRef = `/api/documents/${doc.id}`;
    for (const appRecord of serverApplications.values()) {
      const hasDoc = Array.isArray(appRecord.documents) && appRecord.documents.some((d: any) => d.fileUrl === protectedRef);
      if (hasDoc && canUserAccessApplication(user, activeRole, appRecord)) {
        isAuthorizedStaffForLinkedApp = true;
        break;
      }
    }
  }

  if (!isOwner && !isAdmin && !isAuthorizedStaffForLinkedApp) {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé : vous n’êtes pas autorisé à consulter ce document.',
    });
  }

  return sendProtectedBinaryDocument(res, doc);
});

/**
 * APOGÉE Integration Endpoints (Honest configuration status & demonstration records)
 */
const DEMO_APOGEE_STUDENTS: Record<string, any> = {
  N134098765: {
    cne: 'N134098765',
    cin: 'CD654321',
    fullName: 'Kenza Benali',
    establishmentId: 'fsdm',
    establishmentName: 'Faculté des Sciences Dhar El Mahraz (USMBA)',
    masterSpecialty: 'Informatique Décisionnelle et Systèmes Intelligents (IDSI)',
    graduationYear: 2026,
    mention: 'Très Bien',
    availableAdministrativeDocuments: [
      {
        type: 'bac',
        label: 'Diplôme du Baccalauréat',
        fileName: 'APOGEE_DEMO_Baccalaureat_N134098765.pdf',
        dataUrl: createServerDemoPdfDataUrl('Baccalaureat (Simulation APOGEE)', ['Etudiante : Kenza BENALI', 'CNE : N134098765 | Mention Tres Bien']),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
      {
        type: 'licence',
        label: 'Diplôme de Licence ou équivalent',
        fileName: 'APOGEE_DEMO_Licence_SMI_N134098765.pdf',
        dataUrl: createServerDemoPdfDataUrl('Licence SMI FSDM (Simulation APOGEE)', ['Etudiante : Kenza BENALI', 'Licence SMI - USMBA Fes']),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
      {
        type: 'master',
        label: "Diplôme de Master, Master Spécialisé ou Diplôme d'Ingénieur",
        fileName: 'APOGEE_DEMO_Attestation_Master_IDSI.pdf',
        dataUrl: createServerDemoPdfDataUrl('Master IDSI FSDM (Simulation APOGEE)', ['Etudiante : Kenza BENALI', 'Master IDSI - Mention Tres Bien']),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
      {
        type: 'releves_notes',
        label: "Relevés de notes de l'ensemble du cursus universitaire (S1 à S4)",
        fileName: 'APOGEE_DEMO_Releves_S1_S4_Certifies.pdf',
        dataUrl: createServerDemoPdfDataUrl('Releves S1-S4 (Simulation APOGEE)', [
          ['Etudiante : Kenza BENALI', 'Semestre 1 : 16.40 / 20', 'Semestre 2 : 16.85 / 20'],
          ['Etudiante : Kenza BENALI', 'Semestre 3 : 17.10 / 20', 'Semestre 4 : 17.60 / 20'],
        ]),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
    ],
  },
  N138129845: {
    cne: 'N138129845',
    cin: 'CD712390',
    fullName: 'Youssef Berrada',
    establishmentId: 'ensa',
    establishmentName: 'École Nationale des Sciences Appliquées de Fès (USMBA)',
    masterSpecialty: 'Génie Énergétique et Systèmes Solaires',
    graduationYear: 2026,
    mention: 'Bien',
    availableAdministrativeDocuments: [
      {
        type: 'bac',
        label: 'Diplôme du Baccalauréat',
        fileName: 'APOGEE_DEMO_Bac_N138129845.pdf',
        dataUrl: createServerDemoPdfDataUrl('Baccalaureat (Simulation APOGEE)', ['Etudiant : Youssef BERRADA', 'CNE : N138129845']),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
      {
        type: 'licence',
        label: 'Diplôme de Licence ou équivalent',
        fileName: 'APOGEE_DEMO_Licence_N138129845.pdf',
        dataUrl: createServerDemoPdfDataUrl('Licence ENSA (Simulation APOGEE)', ['Etudiant : Youssef BERRADA', 'CNE : N138129845']),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
      {
        type: 'master',
        label: "Diplôme de Master ou Attestation de Réussite",
        fileName: 'Master_Youssef_Berrada_ENSA.pdf',
        dataUrl: createServerDemoPdfDataUrl('Master ENSA (Simulation APOGEE)', ['Etudiant : Youssef BERRADA']),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
      {
        type: 'releves_notes',
        label: "Relevés de notes S1 à S4",
        fileName: 'Releves_Youssef_Berrada_S1_S4.pdf',
        dataUrl: createServerDemoPdfDataUrl('Releves S1-S4 (Simulation APOGEE)', ['Etudiant : Youssef BERRADA']),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
    ],
  },
  N139445566: {
    cne: 'N139445566',
    cin: 'CD823451',
    fullName: 'Amine Tazi',
    establishmentId: 'fsdm',
    establishmentName: 'Faculté des Sciences Dhar El Mahraz (USMBA)',
    masterSpecialty: 'Réseaux, Systèmes et Sécurité Informatique',
    graduationYear: 2026,
    mention: 'Bien',
    availableAdministrativeDocuments: [
      {
        type: 'bac',
        label: 'Diplôme du Baccalauréat',
        fileName: 'APOGEE_DEMO_Bac_N139445566.pdf',
        dataUrl: createServerDemoPdfDataUrl('Baccalaureat (Simulation APOGEE)', ['Etudiant : Amine TAZI']),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
      {
        type: 'licence',
        label: 'Diplôme de Licence ou équivalent',
        fileName: 'APOGEE_DEMO_Licence_N139445566.pdf',
        dataUrl: createServerDemoPdfDataUrl('Licence FSDM (Simulation APOGEE)', ['Etudiant : Amine TAZI']),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
      {
        type: 'master',
        label: 'Diplôme de Master ou Attestation de Réussite',
        fileName: 'APOGEE_DEMO_Master_N139445566.pdf',
        dataUrl: createServerDemoPdfDataUrl('Master RSSI FSDM (Simulation APOGEE)', ['Etudiant : Amine TAZI']),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
    ],
  },
  N136778899: {
    cne: 'N136778899',
    cin: 'CD781234',
    fullName: 'Imane Bennani',
    establishmentId: 'fsdm',
    establishmentName: 'Faculté des Sciences Dhar El Mahraz (USMBA)',
    masterSpecialty: 'Master Science des Données et Systèmes Intelligents',
    graduationYear: 2026,
    mention: 'Très Bien',
    availableAdministrativeDocuments: [
      {
        type: 'bac',
        label: 'Diplôme du Baccalauréat',
        fileName: 'APOGEE_DEMO_Bac_N136778899.pdf',
        dataUrl: createServerDemoPdfDataUrl('Baccalaureat (Simulation APOGEE)', ['Etudiante : Imane BENNANI']),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
      {
        type: 'licence',
        label: 'Diplôme de Licence ou équivalent',
        fileName: 'APOGEE_DEMO_Licence_N136778899.pdf',
        dataUrl: createServerDemoPdfDataUrl('Licence FSDM (Simulation APOGEE)', ['Etudiante : Imane BENNANI']),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
      {
        type: 'master',
        label: 'Diplôme de Master ou Attestation de Réussite',
        fileName: 'APOGEE_DEMO_Master_N136778899.pdf',
        dataUrl: createServerDemoPdfDataUrl('Master SDSI FSDM (Simulation APOGEE)', ['Etudiante : Imane BENNANI']),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
      {
        type: 'releves_notes',
        label: "Relevés de notes de l'ensemble du cursus (S1 à S4)",
        fileName: 'APOGEE_DEMO_Releves_N136778899.pdf',
        dataUrl: createServerDemoPdfDataUrl('Releves S1-S4 (Simulation APOGEE)', ['Etudiante : Imane BENNANI | Moyenne 16.55 / 20']),
        status: 'valide',
        provenance: 'recupere_administration',
        isDemoApogee: true,
      },
    ],
  },
};

app.get('/api/apogee/status', (_req: Request, res: Response) => {
  const configured = Boolean(process.env.APOGEE_API_URL && process.env.APOGEE_API_URL.trim().length > 0);
  return res.json({
    configured,
    connectionStatus: configured ? 'connected' : 'not_configured',
    message: configured
      ? 'Passerelle APOGÉE configurée.'
      : 'Connexion officielle au système APOGÉE USMBA non encore configurée (APOGEE_API_URL non définie). Seules des données de démonstration locales sont disponibles.',
  });
});

app.get('/api/apogee/student', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  setPrivateDocumentSecurityHeaders(res);
  const cne = String(req.query.cne || req.authUser?.cne || '').trim().toUpperCase();
  const cin = String(req.query.cin || req.authUser?.cin || '').trim().toUpperCase();
  const originTypeParam = String(req.query.originType || req.authUser?.studentOriginType || '');
  const activeRole = req.authSession!.currentRole || req.authUser!.currentRole;

  if (
    cne &&
    req.authUser?.cne &&
    cne !== req.authUser.cne.toUpperCase() &&
    !['administration', 'responsable_gcd'].includes(activeRole)
  ) {
    return res.status(403).json({
      success: false,
      message: 'Accès interdit : vous ne pouvez consulter que votre propre dossier APOGÉE.',
    });
  }

  const apogeeUrl = process.env.APOGEE_API_URL?.trim();
  const apogeeKey = process.env.APOGEE_API_KEY?.trim();

  // If official APOGEE gateway is configured, query it directly
  if (apogeeUrl) {
    try {
      const response = await fetch(`${apogeeUrl.replace(/\/$/, '')}/students?cne=${encodeURIComponent(cne)}&cin=${encodeURIComponent(cin)}`, {
        headers: apogeeKey ? { Authorization: `Bearer ${apogeeKey}` } : {},
      });
      if (!response.ok) {
        return res.status(502).json({
          configured: true,
          connectionStatus: 'error',
          isDemoData: false,
          studentOriginType: originTypeParam === 'externe' ? 'externe' : 'interne_usmba',
          message: 'La passerelle APOGÉE configurée a retourné une erreur lors de la consultation.',
        });
      }
      const data = await response.json();
      return res.json({
        configured: true,
        connectionStatus: 'connected',
        isDemoData: false,
        studentOriginType: data.isInternal ? 'interne_usmba' : 'externe',
        message: 'Données académiques récupérées depuis APOGÉE.',
        studentRecord: data.studentRecord,
      });
    } catch {
      return res.status(502).json({
        configured: true,
        connectionStatus: 'error',
        isDemoData: false,
        studentOriginType: originTypeParam === 'externe' ? 'externe' : 'interne_usmba',
        message: 'Impossible de joindre le serveur APOGÉE configuré.',
      });
    }
  }

  // Honest unconfigured state (strictly independent of @usmba.ac.ma login email domain)
  const isInternalUsmba =
    originTypeParam === 'interne_usmba' ||
    (originTypeParam !== 'externe' && req.authUser?.studentOriginType === 'interne_usmba');

  if (!isInternalUsmba) {
    return res.json({
      configured: false,
      connectionStatus: 'not_configured',
      isDemoData: false,
      studentOriginType: 'externe',
      message:
        'Étudiant externe : le dépôt complet des diplômes, relevés de notes et justificatifs est requis pour vérification administrative.',
    });
  }

  const demoMatch = DEMO_APOGEE_STUDENTS[cne];
  if (demoMatch) {
    return res.json({
      configured: false,
      connectionStatus: 'not_configured',
      isDemoData: true,
      studentOriginType: 'interne_usmba',
      message:
        'Connexion réelle au système APOGÉE non configurée. Affichage des pièces académiques de démonstration USMBA marquées « Récupéré depuis l\'administration (Démo APOGÉE) ».',
      studentRecord: {
        ...demoMatch,
        availableAdministrativeDocuments: demoMatch.availableAdministrativeDocuments.map((d: any) => ({
          type: d.type,
          label: d.label,
          fileName: d.fileName,
          fileUrl: `/api/apogee/documents/${encodeURIComponent(cne)}/${encodeURIComponent(d.type)}/content`,
          status: d.status,
          provenance: d.provenance,
          isDemoApogee: d.isDemoApogee,
        })),
      },
    });
  }

  return res.json({
    configured: false,
    connectionStatus: 'not_configured',
    isDemoData: false,
    studentOriginType: 'interne_usmba',
    message:
      'Connexion officielle au système APOGÉE USMBA non configurée et aucun dossier de démonstration correspondant à ce CNE. Veuillez téléverser les pièces requises ou utiliser le mode externe.',
  });
});

/**
 * Academic Demonstration Profiles Simulation Mechanism
 * Unconditionally active in this academic demonstration project (6 Candidate Scenarios + Staff Profiles).
 */
const DEV_DEMO_ACCOUNT_META: {
  id: string;
  category: 'candidat_scenario' | 'staff_profile';
  spaceLabel: string;
  profileLabel: string;
  description: string;
}[] = [
  {
    id: 'usr-candidat-1',
    category: 'candidat_scenario',
    spaceLabel: 'Scénario 1 • Interne complet',
    profileLabel: 'Interne USMBA — Dossier complet (9/9 pièces valides)',
    description: 'FSDM • CNE N134098765 • Dossier suj-001 complet, entretien programmé.',
  },
  {
    id: 'usr-candidat-2',
    category: 'candidat_scenario',
    spaceLabel: 'Scénario 2 • Interne incomplet',
    profileLabel: 'Interne USMBA — Dossier incomplet (1 pièce manquante)',
    description: 'ENSA • CNE N138129845 • Attestation de non-travail manquante sur app-002 (complétable en ligne).',
  },
  {
    id: 'usr-candidat-3',
    category: 'candidat_scenario',
    spaceLabel: 'Scénario 3 • Document rejeté',
    profileLabel: 'Interne USMBA — Document rejeté avec motif visible',
    description: 'FSDM • CNE N139445566 • Relevé S4 rejeté sur app-003, remplacement fonctionnel.',
  },
  {
    id: 'usr-candidat-4',
    category: 'candidat_scenario',
    spaceLabel: 'Scénario 4 • Externe complet',
    profileLabel: 'Externe — Dossier complet (UH2C Casablanca)',
    description: 'UH2C • CNE R145029384 • 9 pièces fournies et réutilisables pour d’autres sujets.',
  },
  {
    id: 'usr-candidat-5',
    category: 'candidat_scenario',
    spaceLabel: 'Scénario 5 • Externe incomplet',
    profileLabel: 'Externe — Dossier incomplet (complétion progressive)',
    description: 'UCA Marrakech • CNE M142087612 • 4 pièces manquantes à téléverser progressivement.',
  },
  {
    id: 'usr-candidat-6',
    category: 'candidat_scenario',
    spaceLabel: 'Scénario 6 • Multi-candidatures',
    profileLabel: 'Multi-candidatures — Pièces communes réutilisées + 1 spécifique manquante',
    description: 'FSDM • 2 dossiers : app-006a complet (recevable) et app-006b avec 1 lettre spécifique manquante.',
  },
  {
    id: 'usr-chercheur-1',
    category: 'staff_profile',
    spaceLabel: 'Enseignant',
    profileLabel: 'Enseignant-chercheur / Encadrant (LISAC)',
    description: 'Sujets suj-001 / suj-006, candidatures rattachées et suivi doctorants.',
  },
  {
    id: 'usr-labo-1',
    category: 'staff_profile',
    spaceLabel: 'Responsable laboratoire',
    profileLabel: 'Directeur du laboratoire LERMA (ENSA)',
    description: 'Chercheurs rattachés, sujets validés et sujets en attente de visa.',
  },
  {
    id: 'usr-admin-1',
    category: 'staff_profile',
    spaceLabel: 'Administration / Scolarité',
    profileLabel: 'Gestionnaire Administration Scolarité',
    description: 'Instruction de tous les dossiers, contrôle des pièces, inscriptions & réinscriptions.',
  },
  {
    id: 'usr-formation-1',
    category: 'staff_profile',
    spaceLabel: 'Responsable formation',
    profileLabel: 'Responsable Formation Doctorale CEDoc',
    description: 'Formations doctorales, sessions, crédits, planification des entretiens & PV.',
  },
];

app.get('/api/dev/demo-accounts', (_req: Request, res: Response) => {
  const accounts = DEV_DEMO_ACCOUNT_META.map((meta) => {
    const user = serverUsers.get(meta.id);
    if (!user) return null;
    return {
      ...meta,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.currentRole,
      studentOriginType: user.studentOriginType || null,
      isSimulatedDevAccount: true,
      googleAccountLinked: Boolean(user.googleId),
    };
  }).filter(Boolean);

  return res.json({
    success: true,
    environment: 'academic_demo',
    simulationLabel: 'Mode démonstration académique',
    accounts,
  });
});

app.post('/api/dev/demo-login', (req: Request, res: Response) => {
  const { userId } = req.body || {};
  const demoUser = serverUsers.get(String(userId || ''));
  if (!userId || !demoUser || !demoUser.isActive) {
    return res.status(400).json({
      success: false,
      message: 'Identifiant de profil de simulation invalide.',
    });
  }

  const activeRole = demoUser.roles[0];
  const sessionToken = setSessionCookie(req, res, {
    userId: demoUser.id,
    email: demoUser.email,
    currentRole: activeRole,
    roles: [activeRole],
  });

  console.log(`[Simulation Académique] Ouverture session pour ${demoUser.id} (Rôle: ${activeRole})`);

  return res.json({
    success: true,
    environment: 'academic_demo',
    simulationMode: true,
    user: {
      ...serializePublicUser(demoUser),
      roles: [activeRole],
      currentRole: activeRole,
    },
    sessionToken,
  });
});

/**
 * Mount Vite development middlewares or serve static build files
 */
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.all('/api/*', (_req, res) => {
      return res.status(404).json({ success: false, message: 'Endpoint API introuvable.' });
    });
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT} (env: ${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
