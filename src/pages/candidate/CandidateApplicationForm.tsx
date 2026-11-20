import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  FileCheck2,
  CheckCircle2,
  AlertTriangle,
  Building2,
  ArrowRight,
  Printer,
  Info,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { apogeeService } from '../../services/apogeeService';
import {
  CandidateApplication,
  ApplicationDocument,
  DocumentType,
  ApogeeLookupResult
} from '../../types';
import { DocumentUploader } from '../../components/common/DocumentUploader';
import { createDemoPdfDataUrl } from '../../utils/demoPdf';

const REQUIRED_DOC_TYPES: { type: DocumentType; label: string; isSubjectSpecific?: boolean }[] = [
  { type: 'cin', label: "Carte d'Identité Nationale (CIN)" },
  { type: 'bac', label: 'Diplôme du Baccalauréat' },
  { type: 'licence', label: 'Diplôme de Licence ou équivalent' },
  { type: 'master', label: "Diplôme de Master, Master Spécialisé ou Diplôme d'Ingénieur" },
  { type: 'releves_notes', label: "Relevés de notes de l'ensemble du cursus universitaire (S1 à S4)" },
  { type: 'cv', label: 'Curriculum Vitae détaillé et actualisé' },
  { type: 'lettre_motivation', label: 'Lettre de motivation argumentée', isSubjectSpecific: true },
  { type: 'projet_recherche', label: 'Avant-projet de recherche de thèse (3 à 5 pages)', isSubjectSpecific: true },
  { type: 'attestation_non_travail', label: "Attestation de non travail ou autorisation de l'employeur" }
];

export const CandidateApplicationForm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const preselectedSubjectId = searchParams.get('subjectId');

  const { currentUser, sessionToken, refreshUserData } = useAuth();
  const navigate = useNavigate();

  const subjects = useMemo(
    () => storageService.getSubjects().filter((s) => s.status === 'valide' || s.status === 'publie'),
    []
  );

  const existingApps = useMemo(
    () =>
      storageService.getCandidateApplicationsStrict(
        currentUser?.id,
        currentUser?.email,
        currentUser?.cin
      ),
    [currentUser?.id, currentUser?.email, currentUser?.cin]
  );

  const [selectedSubjectId, setSelectedSubjectId] = useState(
    preselectedSubjectId || subjects[0]?.id || ''
  );

  useEffect(() => {
    if (preselectedSubjectId && subjects.some((s) => s.id === preselectedSubjectId)) {
      setSelectedSubjectId(preselectedSubjectId);
    }
  }, [preselectedSubjectId, subjects]);

  const [academicData, setAcademicData] = useState({
    masterOriginUniversity:
      currentUser?.originEstablishment ||
      (currentUser?.studentOriginType === 'interne_usmba'
        ? 'Université Sidi Mohamed Ben Abdellah (USMBA - Fès)'
        : ''),
    masterSpecialty: currentUser?.masterSpecialty || '',
    masterGraduationYear: 2026,
    masterMention: 'Bien' as 'Très Bien' | 'Bien' | 'Assez Bien' | 'Passable'
  });

  const [apogeeResult, setApogeeResult] = useState<ApogeeLookupResult | null>(null);
  const [apogeeLoading, setApogeeLoading] = useState(false);

  const [documents, setDocuments] = useState<ApplicationDocument[]>([]);
  const [reusedDocTypes, setReusedDocTypes] = useState<Set<string>>(new Set());

  const [submittedApp, setSubmittedApp] = useState<CandidateApplication | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lookup APOGÉE status/demo data and merge with reusable candidate documents
  useEffect(() => {
    let active = true;

    const loadDocumentsAndApogee = async () => {
      setApogeeLoading(true);
      const lookup = await apogeeService.lookupStudent({
        cne: currentUser?.cne,
        cin: currentUser?.cin,
        originType: currentUser?.studentOriginType
      });
      if (!active) return;
      setApogeeResult(lookup);
      setApogeeLoading(false);

      if (lookup.studentRecord?.establishmentName && !academicData.masterOriginUniversity) {
        setAcademicData((prev) => ({
          ...prev,
          masterOriginUniversity: lookup.studentRecord?.establishmentName || prev.masterOriginUniversity,
          masterSpecialty: lookup.studentRecord?.masterSpecialty || prev.masterSpecialty
        }));
      }

      const sharedDocs = storageService.getSharedCandidateDocuments(
        currentUser?.id,
        currentUser?.email,
        currentUser?.cin
      );

      const apogeeDocsByType: Record<string, { label: string; fileName: string; fileUrl?: string }> = {};
      if (lookup.studentRecord?.availableAdministrativeDocuments) {
        for (const item of lookup.studentRecord.availableAdministrativeDocuments) {
          apogeeDocsByType[item.type] = {
            label: item.label,
            fileName: item.fileName,
            fileUrl: item.fileUrl
          };
        }
      }

      const isExternalCandidate =
        (lookup.studentOriginType || currentUser?.studentOriginType) === 'externe';

      const reused = new Set<string>();
      const builtDocs: ApplicationDocument[] = REQUIRED_DOC_TYPES.map((req, idx) => {
        // Subject-specific documents always start empty for each new application
        if (req.isSubjectSpecific) {
          return {
            id: `doc-${req.type}-${idx}-${Date.now()}`,
            type: req.type,
            label: req.label,
            fileName: '',
            fileSize: 0,
            fileUrl: '',
            isRequired: true,
            status: 'manquant',
            provenance: 'fourni_candidat',
            uploadedAt: ''
          };
        }

        // 1) Check APOGÉE administrative records (ONLY for internal USMBA students)
        const apogeeMatch = !isExternalCandidate ? apogeeDocsByType[req.type] : undefined;
        if (apogeeMatch) {
          return {
            id: `doc-${req.type}-${idx}`,
            type: req.type,
            label: req.label,
            fileName: apogeeMatch.fileName,
            fileSize: 450000,
            fileUrl: apogeeMatch.fileUrl || '#',
            isRequired: true,
            status: 'valide',
            provenance: 'recupere_administration',
            isDemoApogee: lookup.isDemoData,
            uploadedAt: new Date().toISOString()
          };
        }

        // 2) For external candidates starting a new application: only reuse identity CIN; academic docs must be imported/provided
        if (isExternalCandidate && req.type !== 'cin') {
          return {
            id: `doc-${req.type}-${idx}`,
            type: req.type,
            label: req.label,
            fileName: '',
            fileSize: 0,
            fileUrl: '',
            isRequired: true,
            status: 'manquant',
            provenance: 'fourni_candidat',
            uploadedAt: ''
          };
        }

        // 3) Check reusable documents already provided by candidate (registration CIN or earlier apps for internal)
        const shared = sharedDocs[req.type] as ApplicationDocument | undefined;
        if (shared && shared.fileName) {
          reused.add(req.type);
          return {
            ...shared,
            id: `doc-${req.type}-${idx}`,
            label: req.label,
            isRequired: true,
            status: shared.status === 'rejete' ? 'manquant' : 'en_attente',
            provenance: shared.provenance || 'fourni_candidat'
          };
        }

        // 4) Otherwise require manual upload from candidate (never pre-populate fake PDF!)
        return {
          id: `doc-${req.type}-${idx}`,
          type: req.type,
          label: req.label,
          fileName: '',
          fileSize: 0,
          fileUrl: '',
          isRequired: true,
          status: 'manquant',
          provenance: 'fourni_candidat',
          uploadedAt: ''
        };
      });

      setReusedDocTypes(reused);
      setDocuments(builtDocs);
    };

    loadDocumentsAndApogee();
    return () => {
      active = false;
    };
  }, [currentUser?.id, currentUser?.cne, currentUser?.cin, currentUser?.studentOriginType]);

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);
  const duplicateApplication = existingApps.find((a) => a.subjectId === selectedSubjectId);

  const handleDocumentUpload = (docId: string, file: { fileName: string; fileSize: number; fileUrl: string }) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId
          ? {
              ...d,
              fileName: file.fileName,
              fileSize: file.fileSize,
              fileUrl: file.fileUrl,
              status: 'en_attente',
              provenance: 'fourni_candidat',
              isDemoApogee: false,
              uploadedAt: new Date().toISOString(),
              rejectionReason: undefined
            }
          : d
      )
    );
  };

  const missingDocs = documents.filter((d) => d.isRequired && !d.fileName);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedSubject) {
      setErrorMsg('Veuillez sélectionner un sujet de doctorat valide.');
      return;
    }

    if (duplicateApplication) {
      setErrorMsg(
        `Vous avez déjà déposé une candidature pour ce sujet (Réf : ${duplicateApplication.referenceNumber}).`
      );
      return;
    }

    if (!academicData.masterOriginUniversity.trim() || !academicData.masterSpecialty.trim()) {
      setErrorMsg("Veuillez renseigner votre université d'origine et l'intitulé exact de votre spécialité.");
      return;
    }

    if (missingDocs.length > 0) {
      setErrorMsg(`Dossier incomplet : ${missingDocs.length} pièce(s) obligatoire(s) manquante(s).`);
      return;
    }

    setIsSubmitting(true);
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const refNumber = `USMBA-DOC-2026-${randomNum}`;

    const normalizedDocs: ApplicationDocument[] = documents.map((d) => ({
      ...d,
      status: d.provenance === 'recupere_administration' ? 'valide' : 'en_attente'
    }));

    const newApp: CandidateApplication = {
      id: `app-${Date.now()}`,
      referenceNumber: refNumber,
      candidateId: currentUser?.id || 'usr-candidate',
      candidateName: `${currentUser?.firstName || 'Candidat'} ${currentUser?.lastName || 'USMBA'}`,
      candidateEmail: currentUser?.email || '',
      candidatePhone: currentUser?.phone || '',
      cin: currentUser?.cin || '',
      cne: currentUser?.cne || '',
      studentOriginType:
        apogeeResult?.studentOriginType || currentUser?.studentOriginType || 'externe',
      apogeeSyncStatus:
        apogeeResult?.connectionStatus === 'connected'
          ? 'synced'
          : (apogeeResult?.studentOriginType || currentUser?.studentOriginType) === 'externe'
          ? 'external'
          : 'not_configured',
      subjectId: selectedSubject.id,
      subjectTitle: selectedSubject.title,
      laboratoryId: selectedSubject.laboratoryId,
      establishmentId: selectedSubject.establishmentId,
      supervisorName: selectedSubject.supervisorName || selectedSubject.professeur_nom || 'Non attribué',
      discipline: selectedSubject.discipline,
      masterOriginUniversity: academicData.masterOriginUniversity.trim(),
      masterSpecialty: academicData.masterSpecialty.trim(),
      masterGraduationYear: Number(academicData.masterGraduationYear),
      masterMention: academicData.masterMention,
      status: 'soumise',
      assignedReviewerId: 'usr-admin-1',
      assignedReviewerName: 'Bureau des Études Doctorales (Instruction)',
      documents: normalizedDocs,
      correctionRequests: [],
      statusHistory: [
        {
          id: `sh-${Date.now()}`,
          status: 'soumise',
          comment: 'Dossier de candidature soumis par le candidat.',
          changedBy: `${currentUser?.firstName} ${currentUser?.lastName}`,
          timestamp: new Date().toISOString()
        }
      ],
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save locally
    storageService.saveApplication(newApp, {
      id: currentUser?.id || 'candidat',
      name: `${currentUser?.firstName} ${currentUser?.lastName}`,
      role: 'candidat'
    });

    // Save reusable personal/academic docs on user profile for future applications
    if (currentUser) {
      const reusableTypes = new Set([
        'cin',
        'bac',
        'licence',
        'master',
        'releves_notes',
        'cv',
        'attestation_non_travail',
        'autorisation_employeur'
      ]);
      const sharedMap = new Map<string, ApplicationDocument>();
      for (const prevDoc of currentUser.sharedDocuments || []) {
        sharedMap.set(prevDoc.type, prevDoc);
      }
      for (const doc of normalizedDocs) {
        if (reusableTypes.has(doc.type) && doc.fileName && doc.provenance === 'fourni_candidat') {
          sharedMap.set(doc.type, doc);
        }
      }
      storageService.saveUser({
        ...currentUser,
        originEstablishment: currentUser.originEstablishment || academicData.masterOriginUniversity.trim(),
        masterSpecialty: currentUser.masterSpecialty || academicData.masterSpecialty.trim(),
        sharedDocuments: Array.from(sharedMap.values())
      });
      refreshUserData();
    }

    // Sync to backend API (non-blocking if offline) and replace inline data URLs with protected server URLs
    try {
      const resp = await fetch('/api/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify(newApp)
      });
      if (resp.ok) {
        const respJson = await resp.json();
        if (respJson?.application) {
          storageService.saveApplication(respJson.application, {
            id: currentUser?.id || 'candidat',
            name: `${currentUser?.firstName} ${currentUser?.lastName}`,
            role: 'candidat'
          });
        }
      }
    } catch {
      // Local storage remains authoritative offline
    }

    storageService.addNotification({
      targetRole: 'candidat',
      userId: currentUser?.id,
      title: 'Dépôt confirmé — Réf ' + refNumber,
      message: `Votre candidature pour le sujet "${selectedSubject.title.substring(0, 45)}..." a été enregistrée avec succès.`,
      category: 'candidature',
      link: `/candidat/mon-dossier?appId=${newApp.id}`
    });

    storageService.addNotification({
      targetRole: 'administration',
      title: 'Nouvelle candidature à instruire',
      message: `Le candidat ${newApp.candidateName} (${refNumber}) a déposé un dossier pour le laboratoire ${selectedSubject.laboratoryId.toUpperCase()}.`,
      category: 'candidature',
      link: '/administration/dossiers'
    });

    setIsSubmitting(false);
    setSubmittedApp(newApp);
  };

  if (submittedApp) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div className="bg-white rounded-3xl border border-emerald-200 shadow-xl p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Confirmation de Dépôt Validée
              </span>
              <h1 className="text-2xl font-black text-slate-900 mt-1">
                Accusé de Réception de Candidature
              </h1>
            </div>
          </div>

          <div className="p-5 bg-emerald-50/80 rounded-2xl border border-emerald-200 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs text-emerald-800 font-medium">Numéro de dossier unique généré :</span>
              <span className="text-base font-mono font-black text-emerald-950 bg-white px-3 py-1 rounded-lg border border-emerald-300">
                {submittedApp.referenceNumber}
              </span>
            </div>
            <div className="text-xs text-emerald-800">
              Horodatage certifié : {new Date(submittedApp.submittedAt).toLocaleString('fr-FR')}
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 border-b pb-2">Récapitulatif de la soumission</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-700">
              <div>
                <span className="text-slate-400 block font-semibold">Candidat</span>
                <span className="font-bold text-slate-900">{submittedApp.candidateName} (CIN: {submittedApp.cin})</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold">E-mail Google</span>
                <span className="font-bold text-slate-900">{submittedApp.candidateEmail}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-400 block font-semibold">Sujet de thèse sélectionné</span>
                <span className="font-bold text-slate-900">{submittedApp.subjectTitle}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold">Directeur de Thèse</span>
                <span className="font-bold text-slate-900">{submittedApp.supervisorName}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold">Pièces déposées</span>
                <span className="font-bold text-emerald-700">{submittedApp.documents.length} / {submittedApp.documents.length}</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 leading-relaxed">
            <strong>Prochaine étape :</strong> Votre dossier est transmis pour instruction administrative au CEDoc. Vous pouvez dès maintenant consulter le tableau de bord ou postuler à un autre sujet du catalogue.
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => window.print()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 px-5 py-2.5 rounded-xl text-xs font-bold transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer l&apos;accusé de réception</span>
            </button>

            <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
              <Link
                to="/sujets"
                className="inline-flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors"
              >
                Postuler à un autre sujet
              </Link>
              <button
                type="button"
                onClick={() => navigate('/candidat/dashboard')}
                className="inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-xs"
              >
                <span>Mes candidatures</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 rounded-3xl p-8 text-white shadow-xl space-y-3">
        <div className="inline-flex items-center gap-2 bg-teal-500/20 border border-teal-400/40 px-3 py-1 rounded-full text-teal-300 text-xs font-semibold">
          <FileCheck2 className="w-3.5 h-3.5" />
          Dépôt de Candidature Doctorale • USMBA
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Formulaire de Dépôt de Candidature
        </h1>
        <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
          Vos pièces d&apos;identité et diplômes déjà enregistrés sont réutilisés automatiquement. Seules la lettre de motivation et l&apos;avant-projet de recherche sont spécifiques à chaque sujet.
        </p>
      </div>

      {/* Honest APOGÉE & Student Origin Banner */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-2 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <Building2 className="w-4 h-4 text-teal-600" />
            <span>
              Profil détecté :{' '}
              {currentUser?.studentOriginType === 'interne_usmba'
                ? 'Étudiant interne USMBA'
                : 'Candidat externe / autre établissement'}
            </span>
          </div>
          {apogeeResult && (
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                apogeeResult.configured
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {apogeeResult.configured
                ? 'Passerelle APOGÉE connectée'
                : 'Passerelle APOGÉE officielle non configurée'}
            </span>
          )}
        </div>
        <p className="text-slate-600 leading-relaxed flex items-start gap-2">
          <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <span>
            {apogeeLoading
              ? 'Vérification du service APOGÉE en cours...'
              : apogeeResult?.message ||
                'Les pièces administratives officielles ne peuvent pas être récupérées automatiquement sans connexion APOGÉE active : téléversez vos justificatifs ci-dessous.'}
          </span>
        </p>
        {apogeeResult?.isDemoData && apogeeResult.studentRecord && (
          <div className="p-2.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-[11px]">
            <strong>Données de démonstration APOGÉE ({apogeeResult.studentRecord.establishmentName}) :</strong>{' '}
            {apogeeResult.studentRecord.availableAdministrativeDocuments.length} justificatifs académiques pré-chargés avec le libellé{' '}
            <em>« Récupéré depuis l&apos;administration (Démo APOGÉE) »</em>.
          </div>
        )}
      </div>

      {reusedDocTypes.size > 0 && (
        <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 text-xs text-indigo-900 flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>{reusedDocTypes.size} pièce(s) personnelle(s) ou académique(s)</strong> (ex. CIN / justificatifs précédents) ont été réutilisées automatiquement depuis votre profil. Vous pouvez les conserver ou les remplacer si besoin.
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Step 1: Choix du Sujet */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">
              1
            </span>
            <h3 className="font-bold text-sm text-slate-900">Choix du Sujet de Thèse de Doctorat</h3>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Sélectionner un sujet parmi ceux validés par les laboratoires USMBA :
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
            >
              {subjects.map((s) => {
                const alreadyApplied = existingApps.some((a) => a.subjectId === s.id);
                return (
                  <option key={s.id} value={s.id}>
                    {alreadyApplied ? '[Déjà postulé] ' : ''}[{s.discipline}] {s.title} — Dir: {s.supervisorName || s.professeur_nom || 'À attribuer'}
                  </option>
                );
              })}
            </select>
          </div>

          {duplicateApplication && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Vous avez déjà une candidature active pour ce sujet (Réf :{' '}
                  <strong className="font-mono">{duplicateApplication.referenceNumber}</strong>).
                </span>
              </div>
              <Link
                to={`/candidat/mon-dossier?appId=${duplicateApplication.id}`}
                className="font-bold text-amber-900 underline shrink-0"
              >
                Consulter ce dossier →
              </Link>
            </div>
          )}

          {selectedSubject && (
            <div className="p-4 bg-teal-50/50 rounded-2xl border border-teal-200 text-xs text-teal-900 space-y-1.5">
              <div className="font-bold text-sm text-teal-950">{selectedSubject.title}</div>
              <div className="text-slate-600">
                <strong>Laboratoire :</strong> {selectedSubject.laboratoryId.toUpperCase()} •{' '}
                <strong>Directeur :</strong> {selectedSubject.supervisorName || selectedSubject.professeur_nom || 'Non attribué'}
              </div>
              <div className="text-slate-600">
                <strong>Prérequis attendus :</strong> {selectedSubject.prerequisites}
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Cursus Académique Master */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">
              2
            </span>
            <h3 className="font-bold text-sm text-slate-900">Cursus de Master ou Diplôme d&apos;Ingénieur Équivalent</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Université / Établissement d&apos;origine du Master *
              </label>
              <input
                type="text"
                required
                placeholder="Ex : USMBA - FSDM, Université Mohammed V..."
                value={academicData.masterOriginUniversity}
                onChange={(e) => setAcademicData({ ...academicData, masterOriginUniversity: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Intitulé exact de la Spécialité / Filière *
              </label>
              <input
                type="text"
                required
                placeholder="Ex : Intelligence Artificielle, Droit Public..."
                value={academicData.masterSpecialty}
                onChange={(e) => setAcademicData({ ...academicData, masterSpecialty: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Année d&apos;obtention
              </label>
              <input
                type="number"
                min="2015"
                max="2026"
                required
                value={academicData.masterGraduationYear}
                onChange={(e) => setAcademicData({ ...academicData, masterGraduationYear: Number(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Mention obtenue
              </label>
              <select
                value={academicData.masterMention}
                onChange={(e) =>
                  setAcademicData({
                    ...academicData,
                    masterMention: e.target.value as 'Très Bien' | 'Bien' | 'Assez Bien' | 'Passable'
                  })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="Très Bien">Très Bien (16/20 et plus)</option>
                <option value="Bien">Bien (14 à 15.99/20)</option>
                <option value="Assez Bien">Assez Bien (12 à 13.99/20)</option>
                <option value="Passable">Passable (10 à 11.99/20)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Step 3: Liste de contrôle des documents */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">
                3
              </span>
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Pièces Justificatives du Dossier
                </h3>
                <p className="text-[11px] text-slate-500">
                  Téléversez les documents manquants (PDF, JPG, PNG ou DOCX, max 5 Mo). Aucune pièce fictive n&apos;est ajoutée automatiquement.
                </p>
              </div>
            </div>

            <div className="text-xs font-bold text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-200 self-start sm:self-center">
              {documents.filter((d) => Boolean(d.fileName)).length} / {documents.length} pièces prêtes
            </div>
          </div>

          {import.meta.env.DEV && currentUser?.studentOriginType === 'externe' && missingDocs.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-indigo-50/80 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="text-indigo-900">
                <strong>Mode Test (Développement) :</strong> Candidat externe reconnu — vous pouvez importer vos propres fichiers ci-dessous ou joindre un jeu de justificatifs PDF de démonstration pour tester la soumission.
              </span>
              <button
                type="button"
                onClick={() => {
                  const fullName = `${currentUser.firstName} ${currentUser.lastName}`;
                  setDocuments((prev) =>
                    prev.map((d) =>
                      d.fileName
                        ? d
                        : {
                            ...d,
                            fileName: `Demo_Externe_${d.type}_${currentUser.lastName}.pdf`,
                            fileSize: 215000,
                            fileUrl: createDemoPdfDataUrl(`Justificatif Externe (${d.type})`, [
                              `Candidat externe : ${fullName}`,
                              `Origine : ${currentUser.originEstablishment || 'Etablissement externe'}`,
                              `Piece : ${d.label}`
                            ]),
                            status: 'en_attente',
                            provenance: 'fourni_candidat',
                            uploadedAt: new Date().toISOString()
                          }
                    )
                  );
                }}
                className="shrink-0 bg-indigo-700 hover:bg-indigo-800 text-white font-bold px-3.5 py-2 rounded-xl text-[11px] transition-colors"
              >
                Joindre justificatifs démo externe
              </button>
            </div>
          )}

          <div className="space-y-3">
            {documents.map((doc) => (
              <DocumentUploader
                key={doc.id}
                document={doc}
                onUpload={handleDocumentUpload}
              />
            ))}
          </div>
        </div>

        {/* Submission confirmation bar */}
        <div className="bg-slate-900 p-6 rounded-3xl text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="text-xs space-y-1 text-center sm:text-left">
            <div className="font-bold text-sm text-teal-300">Prêt pour la soumission officielle ?</div>
            <p className="text-slate-300 text-[11px]">
              {missingDocs.length > 0
                ? `${missingDocs.length} pièce(s) obligatoire(s) restent à téléverser avant soumission.`
                : 'Toutes les pièces requises sont prêtes. Un numéro unique et un accusé de réception vous seront délivrés.'}
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || Boolean(duplicateApplication)}
            className="w-full sm:w-auto bg-teal-500 hover:bg-teal-400 disabled:bg-slate-600 disabled:text-slate-300 text-slate-950 font-extrabold px-8 py-3.5 rounded-xl text-xs transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2"
          >
            <span>{isSubmitting ? 'Soumission en cours...' : 'Soumettre définitivement mon dossier'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
