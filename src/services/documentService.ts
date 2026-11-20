import { UserRole } from '../types';

export interface ViewableDocumentInput {
  id?: string;
  label: string;
  fileName: string;
  fileUrl?: string;
  fileSize?: number;
  status?: string;
  provenance?: 'recupere_administration' | 'fourni_candidat';
  isDemoApogee?: boolean;
  rejectionReason?: string;
  ownerId?: string;
  ownerEmail?: string;
  ownerCin?: string;
}

export type DetectedDocumentKind = 'pdf' | 'image' | 'docx' | 'unsupported';

export interface LoadedProtectedDocument {
  blob: Blob;
  objectUrl: string;
  arrayBuffer: ArrayBuffer;
  mimeType: string;
  fileName: string;
  kind: DetectedDocumentKind;
}

export function detectDocumentKind(fileName: string, mimeType: string): DetectedDocumentKind {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  if (mime === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/png' ||
    mime === 'image/webp' ||
    ext === 'jpg' ||
    ext === 'jpeg' ||
    ext === 'png'
  ) {
    return 'image';
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    return 'docx';
  }
  return 'unsupported';
}

function decodeDataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) {
    throw new Error('Format de document encodé invalide.');
  }
  const mimeType = match[1] || 'application/octet-stream';
  const binary = atob(match[2]);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return {
    blob: new Blob([bytes], { type: mimeType }),
    mimeType,
  };
}

export function canClientAccessDocument(
  doc: ViewableDocumentInput,
  currentUserId?: string,
  currentUserEmail?: string,
  currentUserCin?: string,
  activeRole?: UserRole
): boolean {
  if (!currentUserId || !activeRole) return false;
  const staffRoles: UserRole[] = [
    'administration',
    'responsable_gcd',
    'enseignant_chercheur',
    'responsable_labo',
    'responsable_formation',
    'jury',
    'directeur_these',
  ];
  if (staffRoles.includes(activeRole)) return true;

  if (doc.ownerId && doc.ownerId === currentUserId) return true;
  if (doc.ownerEmail && currentUserEmail && doc.ownerEmail.toLowerCase() === currentUserEmail.toLowerCase()) {
    return true;
  }
  if (doc.ownerCin && currentUserCin && doc.ownerCin.toUpperCase() === currentUserCin.toUpperCase()) {
    return true;
  }
  return !doc.ownerId && !doc.ownerEmail && !doc.ownerCin;
}

export async function loadProtectedDocument(
  doc: ViewableDocumentInput,
  options?: {
    sessionToken?: string | null;
    currentUserId?: string;
    currentUserEmail?: string;
    currentUserCin?: string;
    activeRole?: UserRole;
  }
): Promise<LoadedProtectedDocument> {
  const url = doc.fileUrl?.trim();
  if (!url || url === '#') {
    throw new Error('Aucun fichier n’est rattaché à cette pièce.');
  }

  // Protected server endpoint fetch (never cached publicly, requires credentials)
  if (url.startsWith('/api/')) {
    const resp = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        ...(options?.sessionToken ? { Authorization: `Bearer ${options.sessionToken}` } : {}),
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (resp.status === 401) {
      throw new Error('Authentification requise pour consulter ce document confidentiel.');
    }
    if (resp.status === 403) {
      throw new Error('Accès refusé : vous ne disposez pas des droits nécessaires pour consulter ce document.');
    }
    if (!resp.ok) {
      let serverMsg = 'Impossible de charger ce document depuis le serveur sécurisé.';
      try {
        const errJson = await resp.json();
        if (errJson?.message) serverMsg = errJson.message;
      } catch {
        // Ignore parse failure
      }
      throw new Error(serverMsg);
    }

    const contentType = (resp.headers.get('Content-Type') || '').toLowerCase();
    let blob: Blob;
    let resolvedMime = contentType.split(';')[0].trim();
    let resolvedName = doc.fileName || 'document';

    if (contentType.includes('application/json')) {
      const payload = await resp.json();
      const docPayload = payload?.document;
      if (!docPayload?.dataUrl) {
        throw new Error('Le contenu sécurisé du document est indisponible.');
      }
      const decoded = decodeDataUrlToBlob(docPayload.dataUrl);
      blob = decoded.blob;
      resolvedMime = docPayload.mimeType || decoded.mimeType;
      resolvedName = docPayload.fileName || resolvedName;
    } else {
      blob = await resp.blob();
      if (!resolvedMime || resolvedMime === 'application/octet-stream') {
        resolvedMime = blob.type || resolvedMime;
      }
    }

    const arrayBuffer = await blob.arrayBuffer();
    const objectUrl = URL.createObjectURL(blob);
    return {
      blob,
      objectUrl,
      arrayBuffer,
      mimeType: resolvedMime,
      fileName: resolvedName,
      kind: detectDocumentKind(resolvedName, resolvedMime),
    };
  }

  // Local draft / offline session check (only permitted for authorized local owner/staff)
  if (url.startsWith('data:')) {
    if (
      !canClientAccessDocument(
        doc,
        options?.currentUserId,
        options?.currentUserEmail,
        options?.currentUserCin,
        options?.activeRole
      )
    ) {
      throw new Error('Accès refusé : vous ne disposez pas des droits nécessaires pour consulter ce document.');
    }
    const { blob, mimeType } = decodeDataUrlToBlob(url);
    const arrayBuffer = await blob.arrayBuffer();
    const objectUrl = URL.createObjectURL(blob);
    return {
      blob,
      objectUrl,
      arrayBuffer,
      mimeType,
      fileName: doc.fileName || 'document',
      kind: detectDocumentKind(doc.fileName || '', mimeType),
    };
  }

  throw new Error('Source de document non autorisée ou non sécurisée.');
}

export async function downloadProtectedDocument(
  doc: ViewableDocumentInput,
  options?: {
    sessionToken?: string | null;
    currentUserId?: string;
    currentUserEmail?: string;
    currentUserCin?: string;
    activeRole?: UserRole;
  }
): Promise<void> {
  const loaded = await loadProtectedDocument(doc, options);
  try {
    const anchor = window.document.createElement('a');
    anchor.href = loaded.objectUrl;
    anchor.download = loaded.fileName || doc.label || 'document';
    window.document.body.appendChild(anchor);
    anchor.click();
    window.document.body.removeChild(anchor);
  } finally {
    setTimeout(() => URL.revokeObjectURL(loaded.objectUrl), 1500);
  }
}
