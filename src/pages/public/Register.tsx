import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Camera,
  GraduationCap,
  Sparkles,
  Phone,
  User as UserIcon,
  AlertTriangle,
  RotateCcw,
  BadgeCheck,
  Upload,
  Edit3,
  Info
} from 'lucide-react';
import { DocumentCameraScanner } from '../../components/scanner/DocumentCameraScanner';
import {
  GoogleAcademicButton,
  VerifiedGoogleAuthResponse,
} from '../../components/auth/GoogleAcademicButton';
import {
  CINVerificationData,
  StudentCardVerificationData,
  DocumentReconciliation,
  GoogleAuthPayload,
  StudentOriginType,
  ApplicationDocument,
  User
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { ESTABLISHMENTS } from '../../data/seedData';

type CreationMethod = 'camera' | 'upload' | 'manual';
type StepNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

function cleanStringForComparison(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectUsmbaAffiliation(establishmentName: string): boolean {
  const lower = (establishmentName || '').toLowerCase();
  if (!lower) return false;
  if (lower.includes('usmba') || lower.includes('sidi mohamed ben abdellah')) return true;
  return ESTABLISHMENTS.some(
    (e) =>
      lower.includes(e.name.toLowerCase()) ||
      (e.shortName.length > 2 && lower.includes(e.shortName.toLowerCase()))
  );
}

function computeDocumentReconciliation(
  cin: CINVerificationData,
  studentCard: StudentCardVerificationData
): DocumentReconciliation {
  const cinFull = `${cin.lastName || ''} ${cin.firstName || ''}`.trim();
  const cardFull = (
    studentCard.studentFullName ||
    `${studentCard.lastName || ''} ${studentCard.firstName || ''}`
  ).trim();

  if (!cinFull || !cardFull) {
    return {
      status: 'pending',
      score: 50,
      title: 'En attente des données des deux documents',
      message:
        "La concordance identité CIN ↔ Carte d'étudiant sera calculée dès que les deux noms sont renseignés.",
      details: {
        cinFullName: cinFull || 'Non renseigné',
        studentCardFullName: cardFull || 'Non renseigné',
        isLastNameMatched: false,
        isFirstNameMatched: false,
        isEstablishmentRecognized: detectUsmbaAffiliation(studentCard.originEstablishment),
      },
    };
  }

  const cinClean = cleanStringForComparison(cinFull);
  const cardClean = cleanStringForComparison(cardFull);
  const cinLastNameClean = cleanStringForComparison(cin.lastName || '');
  const cinFirstNameClean = cleanStringForComparison(cin.firstName || '');
  const cinTokens = cinClean.split(' ').filter((t) => t.length > 1);
  const cardTokens = cardClean.split(' ').filter((t) => t.length > 1);

  const isLastNameMatched =
    cinLastNameClean.length > 0 &&
    (cardClean.includes(cinLastNameClean) || cinTokens.some((t) => cardTokens.includes(t)));
  const isFirstNameMatched =
    cinFirstNameClean.length > 0 &&
    (cardClean.includes(cinFirstNameClean) ||
      cinFirstNameClean.split(' ').some((t) => cardTokens.includes(t)));
  const matchingTokens = cinTokens.filter((t) => cardTokens.includes(t));
  const tokenMatchRatio = cinTokens.length > 0 ? matchingTokens.length / cinTokens.length : 0;

  const estLower = (studentCard.originEstablishment || '').toLowerCase();
  const recognizedEst = ESTABLISHMENTS.find(
    (e) =>
      estLower.includes(e.name.toLowerCase()) ||
      (e.shortName.length > 2 && estLower.includes(e.shortName.toLowerCase()))
  );

  let status: 'match' | 'partial' | 'mismatch' = 'mismatch';
  let score = Math.round(tokenMatchRatio * 100);
  let title = "Discordance d'identité détectée";
  let message =
    "Le nom figurant sur la carte d'étudiant diffère de celui de votre CIN. Vérifiez la cohérence des informations.";

  if (cinClean === cardClean || tokenMatchRatio >= 0.8 || (isLastNameMatched && isFirstNameMatched)) {
    status = 'match';
    score = 100;
    title = 'Concordance parfaite validée (100%)';
    message = "L'identité civile et l'identité étudiante concordent rigoureusement.";
  } else if (isLastNameMatched || tokenMatchRatio >= 0.4) {
    status = 'partial';
    score = Math.max(score, 75);
    title = 'Concordance partielle vérifiée';
    message = 'Le nom patronymique concorde avec de légères variantes de format.';
  }

  return {
    status,
    score,
    title,
    message,
    details: {
      cinFullName: cinFull,
      studentCardFullName: cardFull,
      isLastNameMatched,
      isFirstNameMatched,
      isEstablishmentRecognized: !!recognizedEst,
      establishmentBadge: recognizedEst
        ? `${recognizedEst.shortName} — ${recognizedEst.name}`
        : undefined,
    },
  };
}

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get('redirect') || sessionStorage.getItem('gcd_pending_redirect') || '';

  const { register, loginWithUser } = useAuth();
  const navState = (location.state as {
    verifiedGoogleUser?: VerifiedGoogleAuthResponse['user'];
    onboardingToken?: string;
  } | null) || null;

  const [creationMethod, setCreationMethod] = useState<CreationMethod | null>(null);
  const [currentStep, setCurrentStep] = useState<StepNumber>(0);
  const [isOcrProcessing, setIsOcrProcessing] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // CIN data — strictly initialized empty (NEVER prefilled with invented values)
  const [cinImage, setCinImage] = useState<string | null>(null);
  const [cinData, setCinData] = useState<CINVerificationData>({
    cin: '',
    lastName: '',
    firstName: '',
    birthDate: '',
    birthPlace: '',
    nationality: '',
  });
  const [cinMissingFields, setCinMissingFields] = useState<string[]>([]);
  const [cinOcrDiagnostic, setCinOcrDiagnostic] = useState<{
    imageSizeKb?: number;
    durationMs?: number;
    confidenceScore?: number;
    modelUsed?: string;
    rawTextExcerpt?: string;
    isValidDocument?: boolean;
  } | null>(null);
  const [cinExtractionStatus, setCinExtractionStatus] = useState<
    'idle' | 'success' | 'warning' | 'error'
  >('idle');
  const [cinWarningMessage, setCinWarningMessage] = useState<string | null>(null);
  const [showCinOcrDetails, setShowCinOcrDetails] = useState<boolean>(false);

  // Student Card data — strictly initialized empty
  const [studentCardImage, setStudentCardImage] = useState<string | null>(null);
  const [studentCardData, setStudentCardData] = useState<StudentCardVerificationData>({
    cne: '',
    massarCode: '',
    studentFullName: '',
    originEstablishment: '',
    masterSpecialty: '',
    academicYear: '',
  });
  const [studentOriginType, setStudentOriginType] = useState<StudentOriginType>('interne_usmba');
  const [studentCardMissingFields, setStudentCardMissingFields] = useState<string[]>([]);
  const [studentCardOcrDiagnostic, setStudentCardOcrDiagnostic] = useState<{
    imageSizeKb?: number;
    durationMs?: number;
    confidenceScore?: number;
    modelUsed?: string;
    rawTextExcerpt?: string;
    isValidDocument?: boolean;
  } | null>(null);
  const [studentCardExtractionStatus, setStudentCardExtractionStatus] = useState<
    'idle' | 'success' | 'warning' | 'error'
  >('idle');
  const [studentCardWarningMessage, setStudentCardWarningMessage] = useState<string | null>(null);
  const [showStudentCardOcrDetails, setShowStudentCardOcrDetails] = useState<boolean>(false);

  const reconciliation = useMemo(
    () => computeDocumentReconciliation(cinData, studentCardData),
    [cinData, studentCardData]
  );

  // Step 5: Server-verified @usmba.ac.ma Google Identity (no manual email input)
  const [googleAuth, setGoogleAuth] = useState<GoogleAuthPayload | null>(() => {
    if (navState?.verifiedGoogleUser?.email) {
      return {
        googleId: navState.verifiedGoogleUser.googleId,
        email: navState.verifiedGoogleUser.email,
        displayName: navState.verifiedGoogleUser.name,
        givenName: navState.verifiedGoogleUser.givenName,
        familyName: navState.verifiedGoogleUser.familyName,
        photoUrl: navState.verifiedGoogleUser.photoUrl,
      };
    }
    return null;
  });
  const [onboardingToken, setOnboardingToken] = useState<string | undefined>(
    navState?.onboardingToken
  );
  const [existingAccountFound, setExistingAccountFound] = useState<{
    user: User;
    sessionToken?: string;
  } | null>(null);

  // Load verified Google onboarding session from HttpOnly cookie if redirected from /login
  useEffect(() => {
    if (googleAuth) return;
    let active = true;
    fetch('/api/auth/google/onboarding', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.success || !data.user?.email) return;
        setGoogleAuth({
          googleId: data.user.googleId,
          email: data.user.email,
          displayName: data.user.name,
          givenName: data.user.givenName,
          familyName: data.user.familyName,
          photoUrl: data.user.photoUrl,
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [googleAuth]);

  // Step 6: Phone
  const [phone, setPhone] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const selectMethod = (method: CreationMethod) => {
    setGlobalError(null);
    setCreationMethod(method);
    if (method === 'manual') {
      // Jump straight to editable form
      setCurrentStep(2);
    } else {
      setCurrentStep(1);
    }
  };

  // STEP 1 -> OCR CIN (Strict no-hallucination handling)
  const handleCinCapture = async (imageBase64: string) => {
    setCinImage(imageBase64);
    setIsOcrProcessing(true);
    setGlobalError(null);
    setCinWarningMessage(null);

    try {
      const resp = await fetch('/api/ocr/cin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });
      const result = await resp.json();

      if (result.success && result.data) {
        setCinData({
          cin: result.data.cin || '',
          lastName: result.data.lastName || '',
          firstName: result.data.firstName || '',
          birthDate: result.data.birthDate || '',
          birthPlace: result.data.birthPlace || '',
          nationality: result.data.nationality || '', // NEVER invent nationality
          cardValidUntil: result.data.cardValidUntil || '',
          rawConfidence: result.diagnostic?.confidenceScore,
          rawText: result.data.rawText || result.diagnostic?.rawTextExcerpt || '',
        });
        setCinMissingFields(result.missingFields || []);

        setCinOcrDiagnostic({
          imageSizeKb: result.diagnostic?.imageSizeKb,
          durationMs: result.diagnostic?.durationMs,
          confidenceScore: result.diagnostic?.confidenceScore,
          modelUsed: result.diagnostic?.modelUsed,
          rawTextExcerpt: result.diagnostic?.rawTextExcerpt || result.data.rawText || '',
          isValidDocument: result.isValidDocument,
        });

        const hasCoreFields = Boolean(result.data.cin || result.data.lastName || result.data.firstName);
        if (result.isValidDocument === false || !hasCoreFields) {
          setCinExtractionStatus('warning');
          setCinWarningMessage(
            "Certains champs de la CIN n'ont pas pu être lus automatiquement. Aucun champ n'a été inventé : veuillez compléter manuellement les champs vides ou importer un fichier plus net."
          );
        } else if ((result.missingFields || []).length > 0) {
          setCinExtractionStatus('warning');
          setCinWarningMessage(
            'Extraction partielle réalisée. Vérifiez les champs reconnus et complétez manuellement ceux restés vides.'
          );
        } else {
          setCinExtractionStatus('success');
          setCinWarningMessage(null);
        }
      } else {
        setCinExtractionStatus('error');
        setCinWarningMessage(
          result.message ||
            "L'analyse OCR automatique n'a pas pu extraire les champs. Saisissez vos informations ci-dessous ou reprenez la numérisation."
        );
      }
      setCurrentStep(2);
    } catch {
      setCinExtractionStatus('error');
      setCinWarningMessage(
        "Service OCR indisponible. Vous pouvez saisir directement vos informations d'état civil ci-dessous."
      );
      setCurrentStep(2);
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // STEP 2: Confirm Civil Identity
  const handleConfirmCin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cinData.cin.trim() || !cinData.lastName.trim() || !cinData.firstName.trim()) {
      setGlobalError('Veuillez renseigner les champs obligatoires (Numéro CIN, Nom, Prénom).');
      return;
    }
    setGlobalError(null);
    if (creationMethod === 'manual') {
      // In manual mode, go directly to academic info form (step 4)
      setCurrentStep(4);
    } else {
      setCurrentStep(3);
    }
  };

  // STEP 3 -> OCR Student Card (Strict no-hallucination handling)
  const handleStudentCardCapture = async (imageBase64: string) => {
    setStudentCardImage(imageBase64);
    setIsOcrProcessing(true);
    setGlobalError(null);
    setStudentCardWarningMessage(null);

    try {
      const resp = await fetch('/api/ocr/student-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });
      const result = await resp.json();

      if (result.success && result.data) {
        const est = result.data.originEstablishment || '';
        setStudentCardData({
          cne: result.data.cne || '',
          massarCode: result.data.massarCode || result.data.cne || '',
          studentFullName: result.data.studentFullName || '',
          lastName: result.data.lastName || '',
          firstName: result.data.firstName || '',
          originEstablishment: est,
          masterSpecialty: result.data.masterSpecialty || '',
          academicYear: result.data.academicYear || '',
          rawConfidence: result.diagnostic?.confidenceScore,
          rawText: result.data.rawText || result.diagnostic?.rawTextExcerpt || '',
        });
        setStudentCardMissingFields(result.missingFields || []);
        if (est) {
          setStudentOriginType(detectUsmbaAffiliation(est) ? 'interne_usmba' : 'externe');
        }

        setStudentCardOcrDiagnostic({
          imageSizeKb: result.diagnostic?.imageSizeKb,
          durationMs: result.diagnostic?.durationMs,
          confidenceScore: result.diagnostic?.confidenceScore,
          modelUsed: result.diagnostic?.modelUsed,
          rawTextExcerpt: result.diagnostic?.rawTextExcerpt || result.data.rawText || '',
          isValidDocument: result.isValidDocument,
        });

        const hasCoreFields = Boolean(
          result.data.cne || result.data.studentFullName || result.data.originEstablishment
        );
        if (result.isValidDocument === false || !hasCoreFields) {
          setStudentCardExtractionStatus('warning');
          setStudentCardWarningMessage(
            "La carte d'étudiant n'a pu être lue que partiellement (ou est illisible). Aucune donnée n'a été inventée : complétez les champs vides ou importez une version plus nette."
          );
        } else if ((result.missingFields || []).length > 0) {
          setStudentCardExtractionStatus('warning');
          setStudentCardWarningMessage(
            'Certains champs n\'apparaissaient pas clairement sur la carte. Vérifiez et complétez manuellement.'
          );
        } else {
          setStudentCardExtractionStatus('success');
          setStudentCardWarningMessage(null);
        }
      } else {
        setStudentCardExtractionStatus('error');
        setStudentCardWarningMessage(
          result.message ||
            "L'extraction OCR automatique a échoué. Veuillez remplir manuellement vos coordonnées académiques."
        );
      }
      setCurrentStep(4);
    } catch {
      setStudentCardExtractionStatus('error');
      setStudentCardWarningMessage(
        "Service OCR indisponible. Saisissez directement vos informations académiques."
      );
      setCurrentStep(4);
    } finally {
      setIsOcrProcessing(false);
    }
  };

  const handleHarmonizeWithCin = () => {
    const cinFull = `${cinData.lastName} ${cinData.firstName}`.trim();
    setStudentCardData({
      ...studentCardData,
      studentFullName: cinFull,
    });
  };

  // STEP 4: Confirm Student Info
  const handleConfirmStudentCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !studentCardData.cne.trim() ||
      !studentCardData.originEstablishment.trim() ||
      !studentCardData.masterSpecialty.trim()
    ) {
      setGlobalError(
        "Veuillez compléter tous les champs obligatoires (Code CNE/Massar, Établissement d'origine, Filière / Diplôme)."
      );
      return;
    }
    setGlobalError(null);
    setCurrentStep(5);
  };

  // STEP 5: Real Google OAuth Authentication (@usmba.ac.ma verified server-side)
  const handleStep5GoogleSuccess = (result: VerifiedGoogleAuthResponse) => {
    setGlobalError(null);
    setExistingAccountFound(null);

    if (result.accountExists && result.existingUser) {
      setExistingAccountFound({
        user: result.existingUser,
        sessionToken: result.sessionToken,
      });
      return;
    }

    if (result.user?.email) {
      setGoogleAuth({
        googleId: result.user.googleId,
        email: result.user.email,
        displayName: result.user.name,
        givenName: result.user.givenName,
        familyName: result.user.familyName,
        photoUrl: result.user.photoUrl,
      });
      if (result.onboardingToken) {
        setOnboardingToken(result.onboardingToken);
      }
      setCurrentStep(6);
    }
  };

  const handleStep5GoogleError = (message: string) => {
    setExistingAccountFound(null);
    setGlobalError(message);
  };

  const handleOpenExistingSpace = () => {
    if (!existingAccountFound) return;
    loginWithUser(existingAccountFound.user, existingAccountFound.sessionToken);
    sessionStorage.removeItem('gcd_pending_redirect');
    if (redirectParam && redirectParam.startsWith('/')) {
      navigate(redirectParam);
    } else {
      navigate('/candidat/dashboard');
    }
  };

  // STEP 6: Confirm Phone
  const handleConfirmPhone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setGlobalError('Veuillez renseigner un numéro de téléphone joignable.');
      return;
    }
    setGlobalError(null);
    setCurrentStep(7);
  };

  // STEP 7: Final Account Creation (server-verified Google @usmba.ac.ma identity + independent academic origin)
  const handleFinalSubmit = async () => {
    setGlobalError(null);

    if (!googleAuth?.email) {
      setGlobalError(
        'Veuillez associer votre compte Google académique (@usmba.ac.ma) avant de valider la création du compte.'
      );
      setCurrentStep(5);
      return;
    }

    setIsSubmitting(true);

    const existingUsers = storageService.getUsers();
    const duplicateCin = existingUsers.find(
      (u) => u.cin.toUpperCase() === cinData.cin.trim().toUpperCase()
    );
    if (duplicateCin) {
      setGlobalError(
        `Un compte existe déjà pour la CIN ${cinData.cin}. Connectez-vous avec votre compte Google existant.`
      );
      setIsSubmitting(false);
      return;
    }

    const estObj =
      ESTABLISHMENTS.find(
        (e) =>
          e.name.toLowerCase().includes(studentCardData.originEstablishment.toLowerCase()) ||
          studentCardData.originEstablishment.toLowerCase().includes(e.shortName.toLowerCase())
      ) || ESTABLISHMENTS[0];

    const sharedDocs: ApplicationDocument[] = [];
    if (cinImage) {
      sharedDocs.push({
        id: `reg-cin-${Date.now()}`,
        type: 'cin',
        label: "Carte d'Identité Nationale (CIN)",
        fileName: cinImage.startsWith('data:application/pdf')
          ? `CIN_${cinData.cin.trim().toUpperCase()}.pdf`
          : `CIN_${cinData.cin.trim().toUpperCase()}.jpg`,
        fileSize: Math.round(cinImage.length * 0.75),
        fileUrl: cinImage,
        isRequired: true,
        status: 'en_attente',
        provenance: 'fourni_candidat',
        uploadedAt: new Date().toISOString(),
      });
    }

    const res = await register({
      firstName: cinData.firstName.trim(),
      lastName: cinData.lastName.trim().toUpperCase(),
      cin: cinData.cin.trim().toUpperCase(),
      cne: studentCardData.cne.trim().toUpperCase(),
      email: googleAuth.email,
      onboardingToken,
      phone: phone.trim(),
      establishmentId: estObj.id,
      studentOriginType,
      originEstablishment: studentCardData.originEstablishment.trim(),
      masterSpecialty: studentCardData.masterSpecialty.trim(),
      academicYear: studentCardData.academicYear.trim(),
      registrationMethod: creationMethod || 'manual',
      identityDocuments:
        cinImage || studentCardImage
          ? {
              cinImage: cinImage || undefined,
              studentCardImage: studentCardImage || undefined,
              scannedAt: new Date().toISOString(),
            }
          : undefined,
      sharedDocuments: sharedDocs,
    });

    if (res.success) {
      sessionStorage.removeItem('gcd_pending_redirect');
      if (redirectParam && redirectParam.startsWith('/')) {
        navigate(redirectParam);
      } else {
        navigate('/candidat/dashboard');
      }
    } else {
      setGlobalError(res.message);
      setIsSubmitting(false);
    }
  };

  const stepsHeader =
    creationMethod === 'manual'
      ? [
          { num: 0, label: 'Méthode' },
          { num: 2, label: 'Identité civile' },
          { num: 4, label: 'Cursus & Origine' },
          { num: 5, label: 'Compte Google' },
          { num: 6, label: 'Téléphone' },
          { num: 7, label: 'Validation' },
        ]
      : [
          { num: 0, label: 'Méthode' },
          { num: 1, label: creationMethod === 'upload' ? 'Import CIN' : 'Scan CIN' },
          { num: 2, label: 'Vérif. CIN' },
          { num: 3, label: creationMethod === 'upload' ? 'Import Carte' : 'Scan Carte' },
          { num: 4, label: 'Vérif. Étudiant' },
          { num: 5, label: 'Google' },
          { num: 6, label: 'Téléphone' },
          { num: 7, label: 'Confirmation' },
        ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full text-xs font-semibold">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
          Création de Compte Candidat au Doctorat — USMBA Fès
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Enrôlement Candidat &amp; Association Google
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto">
          Choisissez librement votre méthode : scan par caméra, importation de documents (JPG, PNG, PDF) ou saisie manuelle. Toutes vos informations restent modifiables avant validation.
        </p>
      </div>

      {redirectParam && (
        <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl text-xs text-teal-900 flex items-center gap-2.5">
          <Info className="w-4 h-4 text-teal-700 shrink-0" />
          <span>
            Une fois votre compte créé, vous serez automatiquement redirigé(e) vers le formulaire de candidature du sujet sélectionné.
          </span>
        </div>
      )}

      {/* Progress Stepper */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs overflow-x-auto">
        <div className="flex items-center justify-between gap-2 min-w-[420px]">
          {stepsHeader.map((s, index) => {
            const currentIdx = stepsHeader.findIndex((x) => x.num === currentStep);
            const isDone = currentIdx > index;
            const isCurrent = currentStep === s.num;
            return (
              <div key={s.num} className="flex-1 text-center space-y-1">
                <div
                  className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                    isDone
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                      ? 'bg-teal-600 text-white ring-4 ring-teal-100'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : index + 1}
                </div>
                <div
                  className={`text-[10px] leading-tight truncate ${
                    isCurrent ? 'font-bold text-teal-900' : 'text-slate-500'
                  }`}
                >
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Error Banner */}
      {globalError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-start gap-2.5 shadow-2xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1 font-medium">{globalError}</div>
        </div>
      )}

      {/* STEP 0: FREE CHOICE OF REGISTRATION METHOD */}
      {currentStep === 0 && (
        <div className="space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-2">
            <h2 className="text-lg font-extrabold text-slate-900">
              Choisissez votre méthode de création de compte
            </h2>
            <p className="text-xs text-slate-500">
              Vous êtes libre de choisir le parcours le plus pratique selon votre équipement et vos documents disponibles.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Method A */}
            <button
              type="button"
              onClick={() => selectMethod('camera')}
              className="bg-white hover:bg-teal-50/40 border-2 border-slate-200 hover:border-teal-500 rounded-3xl p-6 text-left space-y-4 transition-all shadow-xs group flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Camera className="w-6 h-6" />
                </div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                  Méthode A
                </div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Scanner avec la caméra
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Capturez votre CIN et votre carte d&apos;étudiant directement avec la webcam de votre ordinateur ou smartphone avec détection de qualité et extraction OCR.
                </p>
              </div>
              <div className="pt-2 text-xs font-bold text-teal-700 flex items-center gap-1.5">
                <span>Démarrer le scan caméra</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>

            {/* Method B */}
            <button
              type="button"
              onClick={() => selectMethod('upload')}
              className="bg-white hover:bg-sky-50/40 border-2 border-slate-200 hover:border-sky-500 rounded-3xl p-6 text-left space-y-4 transition-all shadow-xs group flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
                  Méthode B
                </div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Importer les documents
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Importez les fichiers numérisés de votre CIN et carte d&apos;étudiant / attestation (JPG, JPEG, PNG ou PDF) depuis votre appareil pour analyse OCR.
                </p>
              </div>
              <div className="pt-2 text-xs font-bold text-sky-700 flex items-center gap-1.5">
                <span>Importer JPG / PNG / PDF</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>

            {/* Method C */}
            <button
              type="button"
              onClick={() => selectMethod('manual')}
              className="bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-700 rounded-3xl p-6 text-left space-y-4 transition-all shadow-xs group flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Edit3 className="w-6 h-6" />
                </div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Méthode C
                </div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Remplir manuellement
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Saisissez directement votre identité civile et vos coordonnées universitaires dans le formulaire sans obligation de caméra ou de scan immédiat.
                </p>
              </div>
              <div className="pt-2 text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span>Accéder au formulaire direct</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* STEP 1: SCAN OR UPLOAD CIN */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">
                Étape 1 : {creationMethod === 'upload' ? 'Importation' : 'Capture caméra'} de votre CIN
              </h2>
              <p className="text-xs text-slate-600">
                Formats acceptés : JPG, JPEG, PNG, PDF. L&apos;OCR extrait uniquement les mentions lisibles sans rien inventer.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCurrentStep(0)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Changer de méthode
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreationMethod('manual');
                  setCurrentStep(2);
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800"
              >
                Saisir manuellement
              </button>
            </div>
          </div>

          <DocumentCameraScanner
            documentLabel="votre Carte Nationale d'Identité (CIN)"
            documentType="cin"
            initialMode={creationMethod === 'upload' ? 'upload' : 'camera'}
            onCaptureCompleted={handleCinCapture}
            isProcessing={isOcrProcessing}
          />
        </div>
      )}

      {/* STEP 2: VERIFY OR MANUALLY FILL CIN */}
      {currentStep === 2 && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full text-xs font-semibold mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                {creationMethod === 'manual'
                  ? 'Saisie manuelle : Identité Civile (CIN)'
                  : 'Vérification obligatoire des informations de la CIN'}
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                {creationMethod === 'manual'
                  ? "Renseignez vos informations d'identité"
                  : 'Contrôlez et confirmez les données extraites'}
              </h2>
              <p className="text-xs text-slate-500">
                {creationMethod === 'manual'
                  ? 'Complétez fidèlement les informations figurant sur votre pièce d\'identité officielle.'
                  : 'Aucun champ illisible n\'a été inventé. Vérifiez chaque valeur et complétez les champs vides avant validation.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCurrentStep(creationMethod === 'manual' ? 0 : 1)}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 self-start sm:self-center"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{creationMethod === 'manual' ? 'Changer de méthode' : 'Reprendre la CIN'}</span>
            </button>
          </div>

          {creationMethod !== 'manual' && cinExtractionStatus === 'success' && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-xs text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="font-bold flex items-center gap-2">
                  <span>Extraction OCR CIN effectuée</span>
                  {cinOcrDiagnostic?.durationMs && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-mono">
                      {cinOcrDiagnostic.durationMs} ms
                    </span>
                  )}
                </div>
                <p className="text-emerald-800/90 text-[11px]">
                  Document original sauvegardé avec votre compte. Vérifiez les valeurs ci-dessous.
                </p>
              </div>
            </div>
          )}

          {creationMethod !== 'manual' && cinWarningMessage && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <div className="font-bold">Champs à vérifier ou compléter manuellement</div>
                <p className="text-amber-800 text-[11px] leading-relaxed">{cinWarningMessage}</p>
                {cinMissingFields.length > 0 && (
                  <p className="text-[11px] font-semibold text-amber-950">
                    Non extraits automatiquement : {cinMissingFields.join(', ')}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 underline hover:text-amber-700"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Réessayer avec un document plus lisible</span>
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleConfirmCin} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Numéro de CIN <span className="text-rose-500">*</span>
                  </label>
                  {creationMethod !== 'manual' && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        cinData.cin.trim()
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {cinData.cin.trim() ? 'Extrait' : 'À compléter'}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={cinData.cin}
                  onChange={(e) => setCinData({ ...cinData, cin: e.target.value.toUpperCase() })}
                  placeholder="Ex : CD123456"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 font-mono font-bold focus:ring-2 focus:ring-teal-500 focus:bg-white uppercase"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">Nationalité</label>
                  {creationMethod !== 'manual' && !cinData.nationality.trim() && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      Non extraite — Saisir si applicable
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={cinData.nationality}
                  onChange={(e) => setCinData({ ...cinData, nationality: e.target.value })}
                  placeholder="Ex : Marocaine"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Nom de famille <span className="text-rose-500">*</span>
                  </label>
                  {creationMethod !== 'manual' && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        cinData.lastName.trim()
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {cinData.lastName.trim() ? 'Extrait' : 'À compléter'}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={cinData.lastName}
                  onChange={(e) => setCinData({ ...cinData, lastName: e.target.value.toUpperCase() })}
                  placeholder="NOM DE FAMILLE"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 font-bold focus:ring-2 focus:ring-teal-500 focus:bg-white uppercase"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Prénom <span className="text-rose-500">*</span>
                  </label>
                  {creationMethod !== 'manual' && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        cinData.firstName.trim()
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {cinData.firstName.trim() ? 'Extrait' : 'À compléter'}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={cinData.firstName}
                  onChange={(e) => setCinData({ ...cinData, firstName: e.target.value })}
                  placeholder="Prénom"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 font-bold focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Date de naissance</label>
                <input
                  type="text"
                  value={cinData.birthDate}
                  onChange={(e) => setCinData({ ...cinData, birthDate: e.target.value })}
                  placeholder="JJ/MM/AAAA"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lieu de naissance</label>
                <input
                  type="text"
                  value={cinData.birthPlace}
                  onChange={(e) => setCinData({ ...cinData, birthPlace: e.target.value })}
                  placeholder="Ville de naissance"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>
            </div>

            {creationMethod !== 'manual' && cinOcrDiagnostic && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowCinOcrDetails(!showCinOcrDetails)}
                  className="text-xs font-bold text-slate-700 flex items-center justify-between w-full hover:text-teal-800"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    Détails techniques OCR CIN
                  </span>
                  <span className="text-teal-700 text-[11px] font-semibold underline">
                    {showCinOcrDetails ? 'Masquer' : 'Afficher'}
                  </span>
                </button>
                {showCinOcrDetails && (
                  <pre className="text-slate-300 bg-slate-950 p-3 rounded-xl text-[10px] font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {cinOcrDiagnostic.rawTextExcerpt || cinData.rawText || 'Aucun texte brut retourné.'}
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCurrentStep(creationMethod === 'manual' ? 0 : 1)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Retour</span>
              </button>

              <button
                type="submit"
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2"
              >
                <span>Confirmer et continuer</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 3: SCAN OR UPLOAD STUDENT CARD */}
      {currentStep === 3 && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">
                Étape 3 : {creationMethod === 'upload' ? 'Importation' : 'Numérisation'} de votre Carte d&apos;Étudiant / Attestation Master
              </h2>
              <p className="text-xs text-slate-600">
                Formats acceptés : JPG, JPEG, PNG, PDF. Permet d&apos;extraire le CNE, l&apos;établissement et la filière.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCurrentStep(4)}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800 shrink-0"
            >
              Saisir manuellement
            </button>
          </div>

          <DocumentCameraScanner
            documentLabel="votre Carte d'Étudiant / Attestation de Master"
            documentType="student-card"
            initialMode={creationMethod === 'upload' ? 'upload' : 'camera'}
            onCaptureCompleted={handleStudentCardCapture}
            isProcessing={isOcrProcessing}
          />
        </div>
      )}

      {/* STEP 4: STUDENT ACADEMIC INFO & ORIGIN TYPE */}
      {currentStep === 4 && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full text-xs font-semibold mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                Coordonnées Académiques &amp; Origine Universitaire
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Vérifiez et confirmez votre cursus universitaire
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setCurrentStep(creationMethod === 'manual' ? 2 : 3)}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 self-start sm:self-center"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Retour</span>
            </button>
          </div>

          {/* USMBA Internal vs External Classification (independent from @usmba.ac.ma login domain) */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-800 block">
                Statut d&apos;origine universitaire <span className="text-rose-500">*</span>
              </span>
              <p className="text-[11px] text-slate-500">
                Indiquez votre établissement de provenance académique (indépendamment de votre compte de connexion Google @usmba.ac.ma).
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <button
                type="button"
                onClick={() => setStudentOriginType('interne_usmba')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  studentOriginType === 'interne_usmba'
                    ? 'bg-teal-50 border-teal-500 ring-2 ring-teal-200'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="font-bold text-slate-900">Étudiant interne USMBA</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Diplômé / inscrit dans un établissement de l&apos;USMBA Fès (consultation administrative / APOGÉE).
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStudentOriginType('externe')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  studentOriginType === 'externe'
                    ? 'bg-sky-50 border-sky-500 ring-2 ring-sky-200'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="font-bold text-slate-900">Étudiant externe (Autre université)</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Issu d&apos;une autre université marocaine ou étrangère (dépôt des diplômes &amp; relevés requis).
                </div>
              </button>
            </div>
          </div>

          {creationMethod !== 'manual' && (
            <div
              className={`p-4 rounded-2xl border ${
                reconciliation.status === 'match'
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : reconciliation.status === 'partial'
                  ? 'bg-amber-50/70 border-amber-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <BadgeCheck className="w-4 h-4 text-teal-700 shrink-0" />
                  <span className="font-bold text-slate-900">
                    Concordance CIN ↔ Carte d&apos;Étudiant : {reconciliation.score}%
                  </span>
                </div>
                {reconciliation.status !== 'match' && (
                  <button
                    type="button"
                    onClick={handleHarmonizeWithCin}
                    className="px-3 py-1 bg-white border border-slate-300 text-teal-800 text-[11px] font-bold rounded-lg hover:bg-teal-50 self-start"
                  >
                    Copier le nom de la CIN
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-600 mt-1">{reconciliation.message}</p>
            </div>
          )}

          {creationMethod !== 'manual' && studentCardWarningMessage && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="font-bold">Vérification manuelle requise</div>
                <p className="text-amber-800 text-[11px]">{studentCardWarningMessage}</p>
                {studentCardMissingFields.length > 0 && (
                  <p className="text-[11px] font-semibold">
                    Champs non détectés : {studentCardMissingFields.join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleConfirmStudentCard} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Code CNE / Code Massar <span className="text-rose-500">*</span>
                  </label>
                  {creationMethod !== 'manual' && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        studentCardData.cne.trim()
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {studentCardData.cne.trim() ? 'Extrait' : 'À compléter'}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={studentCardData.cne}
                  onChange={(e) =>
                    setStudentCardData({ ...studentCardData, cne: e.target.value.toUpperCase() })
                  }
                  placeholder="Ex : N134098765"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 font-mono font-bold focus:ring-2 focus:ring-teal-500 focus:bg-white uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nom complet (sur la carte d&apos;étudiant)
                </label>
                <input
                  type="text"
                  value={studentCardData.studentFullName}
                  onChange={(e) =>
                    setStudentCardData({ ...studentCardData, studentFullName: e.target.value })
                  }
                  placeholder="Nom et prénom"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Établissement / Université d&apos;origine <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={studentCardData.originEstablishment}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStudentCardData({ ...studentCardData, originEstablishment: val });
                    if (val.trim()) {
                      setStudentOriginType(detectUsmbaAffiliation(val) ? 'interne_usmba' : 'externe');
                    }
                  }}
                  placeholder="Ex : Faculté des Sciences Dhar El Mahraz, ou autre université..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-2 text-[11px]">
                  <span className="text-slate-400 font-semibold">USMBA :</span>
                  {ESTABLISHMENTS.map((est) => (
                    <button
                      key={est.id}
                      type="button"
                      onClick={() => {
                        setStudentCardData({ ...studentCardData, originEstablishment: est.name });
                        setStudentOriginType('interne_usmba');
                      }}
                      className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-900 border border-slate-200 text-[10px] font-bold"
                    >
                      {est.shortName}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setStudentCardData({ ...studentCardData, originEstablishment: '' });
                      setStudentOriginType('externe');
                    }}
                    className="px-2 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-bold"
                  >
                    Autre université (Externe)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Filière / Spécialité Master <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={studentCardData.masterSpecialty}
                  onChange={(e) =>
                    setStudentCardData({ ...studentCardData, masterSpecialty: e.target.value })
                  }
                  placeholder="Ex : Master Informatique & IA"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Année universitaire inscrite
                </label>
                <input
                  type="text"
                  value={studentCardData.academicYear}
                  onChange={(e) =>
                    setStudentCardData({ ...studentCardData, academicYear: e.target.value })
                  }
                  placeholder="Ex : 2025-2026"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>
            </div>

            {creationMethod !== 'manual' && studentCardOcrDiagnostic && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowStudentCardOcrDetails(!showStudentCardOcrDetails)}
                  className="text-xs font-bold text-slate-700 flex items-center justify-between w-full hover:text-teal-800"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    Détails techniques OCR Carte d&apos;Étudiant
                  </span>
                  <span className="text-teal-700 text-[11px] font-semibold underline">
                    {showStudentCardOcrDetails ? 'Masquer' : 'Afficher'}
                  </span>
                </button>
                {showStudentCardOcrDetails && (
                  <pre className="text-slate-300 bg-slate-950 p-3 rounded-xl text-[10px] font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {studentCardOcrDiagnostic.rawTextExcerpt ||
                      studentCardData.rawText ||
                      'Aucun texte brut retourné.'}
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCurrentStep(creationMethod === 'manual' ? 2 : 3)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Retour</span>
              </button>

              <button
                type="submit"
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2"
              >
                <span>Confirmer les données académiques</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 5: GOOGLE ACADEMIC AUTHENTICATION (@usmba.ac.ma ONLY, NO MANUAL INPUT) */}
      {currentStep === 5 && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 max-w-xl mx-auto">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-teal-50 text-teal-700 rounded-2xl flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">
              Association d&apos;un compte Google académique (@usmba.ac.ma)
            </h2>
            <p className="text-xs text-slate-500">
              Mode démonstration académique : sélectionnez un compte simulé se terminant par <span className="font-mono font-bold">@usmba.ac.ma</span> (les domaines externes ou Gmail personnels sont rejetés).
            </p>
          </div>

          {existingAccountFound && (
            <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl text-xs text-teal-900 space-y-3">
              <div className="font-bold">
                Un compte GCD existe déjà pour {existingAccountFound.user.email}.
              </div>
              <button
                type="button"
                onClick={handleOpenExistingSpace}
                className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2"
              >
                <span>Ouvrir directement mon espace personnel</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {googleAuth?.email ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-emerald-950 truncate">
                      {googleAuth.email}
                    </div>
                    <div className="text-[11px] text-emerald-800">
                      Compte Google académique USMBA vérifié
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setGoogleAuth(null);
                    setOnboardingToken(undefined);
                  }}
                  className="text-[11px] font-bold text-slate-600 hover:text-slate-900 underline shrink-0"
                >
                  Changer
                </button>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(6)}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2"
                >
                  <span>Continuer</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <GoogleAcademicButton
                onSuccess={handleStep5GoogleSuccess}
                onError={handleStep5GoogleError}
                disabled={isSubmitting}
                mode="register"
              />

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Retour
                </button>
                <span className="text-[11px] text-slate-400">
                  Domaine requis : @usmba.ac.ma
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 6: PHONE */}
      {currentStep === 6 && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 max-w-xl mx-auto">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-xl font-bold text-slate-900">Numéro de téléphone joignable</h2>
            <p className="text-xs text-slate-500">
              Utilisé pour les convocations aux entretiens et alertes administratives.
            </p>
          </div>

          <form onSubmit={handleConfirmPhone} className="space-y-4">
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+212 6 12 34 56 78"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-800 font-mono font-medium focus:ring-2 focus:ring-teal-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCurrentStep(5)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Retour
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2"
              >
                <span>Voir le récapitulatif</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 7: SUMMARY & ACCOUNT CREATION */}
      {currentStep === 7 && (
        <div className="bg-white p-6 sm:p-10 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-xl font-bold text-slate-900">
              Récapitulatif et confirmation de votre compte
            </h2>
            <p className="text-xs text-slate-500">
              Vérifiez l&apos;ensemble de vos données avant la création définitive du compte candidat.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 pb-1 border-b border-slate-200">
                <UserIcon className="w-4 h-4 text-teal-600" />
                <span>Identité Civile</span>
              </div>
              <div>CIN : <strong className="font-mono">{cinData.cin}</strong></div>
              <div>Nom &amp; Prénom : <strong>{cinData.lastName} {cinData.firstName}</strong></div>
              <div>Nationalité : <span>{cinData.nationality || 'Non renseignée'}</span></div>
              <div>Date de naissance : <span>{cinData.birthDate || 'Non renseignée'}</span></div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 pb-1 border-b border-slate-200">
                <GraduationCap className="w-4 h-4 text-teal-600" />
                <span>Coordonnées Académiques</span>
              </div>
              <div>CNE / Massar : <strong className="font-mono text-teal-800">{studentCardData.cne}</strong></div>
              <div>Établissement : <strong>{studentCardData.originEstablishment}</strong></div>
              <div>Filière : <strong>{studentCardData.masterSpecialty}</strong></div>
              <div>
                Origine :{' '}
                <span className="font-semibold text-teal-700">
                  {studentOriginType === 'interne_usmba' ? 'Étudiant interne USMBA' : 'Étudiant externe'}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Compte Google
              </div>
              <div className="font-mono text-slate-800">{googleAuth?.email}</div>
              <div className="text-[11px] text-slate-500">
                Méthode : {creationMethod === 'camera' ? 'Scan caméra' : creationMethod === 'upload' ? 'Importation de fichiers' : 'Saisie manuelle'}
                {(cinImage || studentCardImage) && ' • Documents originaux joints au compte'}
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-teal-600" />
                Téléphone
              </div>
              <div className="font-mono font-bold text-slate-900">{phone}</div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCurrentStep(4)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Modifier</span>
            </button>

            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              className="px-8 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-2xl text-xs font-black transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Création du compte en cours...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmer et créer mon compte</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
