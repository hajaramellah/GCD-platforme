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
  Sparkles,
  Trash2,
  Plus,
  FolderCheck,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { apogeeService } from '../../services/apogeeService';
import {
  CandidateApplication,
  ApplicationDocument,
  DocumentType,
  ApogeeLookupResult,
} from '../../types';
import { DocumentUploader } from '../../components/common/DocumentUploader';
import { createDemoPdfDataUrl } from '../../utils/demoPdf';
import {
  COMMON_DOCUMENT_SPECS,
  getRequiredDocumentsForSubject,
  isCommonDocumentType,
  isDocumentProvided,
  summarizeApplicationDocuments,
} from '../../utils/documentRequirements';
import { StatusBadge } from '../../components/common/StatusBadge';

const SELECTED_SUBJECTS_STORAGE_KEY = 'gcd_selected_subject_ids';

export const CandidateApplicationForm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const querySubjectIds = searchParams.get('subjectIds');
  const querySingleSubjectId = searchParams.get('subjectId');

  const { currentUser, sessionToken, refreshUserData } = useAuth();
  const navigate = useNavigate();

  const subjects = useMemo(
    () =>
      storageService
        .getSubjects()
        .filter((s) => s.status !== 'archive' && s.status !== 'rejete'),
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

  const existingSubjectIdSet = useMemo(
    () => new Set(existingApps.map((a) => a.subjectId)),
    [existingApps]
  );

  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>(() => {
    const rawIds: string[] = [];
    if (querySubjectIds) {
      rawIds.push(
        ...querySubjectIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
    } else if (querySingleSubjectId) {
      rawIds.push(querySingleSubjectId.trim());
    } else {
      try {
        const stored = sessionStorage.getItem(SELECTED_SUBJECTS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) rawIds.push(...parsed);
        }
      } catch {
        // Ignore
      }
    }
    const valid = Array.from(new Set(rawIds)).filter((id) =>
      subjects.some((s) => s.id === id)
    );
    if (valid.length > 0) return valid;
    const firstAvailable = subjects.find((s) => !existingSubjectIdSet.has(s.id)) || subjects[0];
    return firstAvailable ? [firstAvailable.id] : [];
  });

  useEffect(() => {
    if (querySubjectIds || querySingleSubjectId) {
      const incoming = (querySubjectIds ? querySubjectIds.split(',') : [querySingleSubjectId || ''])
        .map((s) => s.trim())
        .filter((id) => Boolean(id) && subjects.some((s) => s.id === id));
      if (incoming.length > 0) {
        setSelectedSubjectIds(Array.from(new Set(incoming)));
      }
    }
  }, [querySubjectIds, querySingleSubjectId, subjects]);

  const [addSubjectPickerId, setAddSubjectPickerId] = useState<string>('');

  const [academicData, setAcademicData] = useState({
    masterOriginUniversity:
      currentUser?.originEstablishment ||
      (currentUser?.studentOriginType === 'interne_usmba'
        ? 'Université Sidi Mohamed Ben Abdellah (USMBA - Fès)'
        : ''),
    masterSpecialty: currentUser?.masterSpecialty || '',
    masterGraduationYear: 2026,
    masterMention: 'Bien' as 'Très Bien' | 'Bien' | 'Assez Bien' | 'Passable',
  });

  const [apogeeResult, setApogeeResult] = useState<ApogeeLookupResult | null>(null);
  const [apogeeLoading, setApogeeLoading] = useState(false);

  // Common vault documents (filled ONCE, shared across all selected subjects)
  const [commonDocs, setCommonDocs] = useState<ApplicationDocument[]>([]);
  const [reusedDocTypes, setReusedDocTypes] = useState<Set<string>>(new Set());

  // Per-subject specific documents (e.g., lettre_motivation, projet_recherche, lettre_recommandation)
  const [subjectSpecificDocsMap, setSubjectSpecificDocsMap] = useState<
    Record<string, ApplicationDocument[]>
  >({});

  const [submittedApps, setSubmittedApps] = useState<CandidateApplication[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load centralized personal vault + simulated APOGÉE records
  useEffect(() => {
    let active = true;

    const loadVaultAndApogee = async () => {
      setApogeeLoading(true);
      const lookup = await apogeeService.lookupStudent({
        cne: currentUser?.cne,
        cin: currentUser?.cin,
        originType: currentUser?.studentOriginType,
      });
      if (!active) return;
      setApogeeResult(lookup);
      setApogeeLoading(false);

      if (lookup.studentRecord?.establishmentName && !academicData.masterOriginUniversity) {
        setAcademicData((prev) => ({
          ...prev,
          masterOriginUniversity:
            lookup.studentRecord?.establishmentName || prev.masterOriginUniversity,
          masterSpecialty: lookup.studentRecord?.masterSpecialty || prev.masterSpecialty,
        }));
      }

      const sharedDocs = storageService.getSharedCandidateDocuments(
        currentUser?.id,
        currentUser?.email,
        currentUser?.cin
      );

      const apogeeDocsByType: Record<
        string,
        { label: string; fileName: string; fileUrl?: string }
      > = {};
      if (lookup.studentRecord?.availableAdministrativeDocuments) {
        for (const item of lookup.studentRecord.availableAdministrativeDocuments) {
          apogeeDocsByType[item.type] = {
            label: item.label,
            fileName: item.fileName,
            fileUrl: item.fileUrl,
          };
        }
      }

      const isExternalCandidate =
        (lookup.studentOriginType || currentUser?.studentOriginType) === 'externe';

      const reused = new Set<string>();
      const builtCommonDocs: ApplicationDocument[] = COMMON_DOCUMENT_SPECS.map((spec, idx) => {
        // 1. Simulated APOGÉE for internal USMBA students
        const apogeeMatch = !isExternalCandidate ? apogeeDocsByType[spec.type] : undefined;
        if (apogeeMatch) {
          reused.add(spec.type);
          return {
            id: `common-${spec.type}-${idx}`,
            type: spec.type,
            label: spec.label,
            fileName: apogeeMatch.fileName,
            fileSize: 450000,
            fileUrl: apogeeMatch.fileUrl || '#',
            isRequired: spec.isRequired,
            status: 'valide',
            provenance: 'recupere_administration',
            isDemoApogee: true,
            uploadedAt: new Date().toISOString(),
          };
        }

        // 2. Centralized candidate document vault (reused for BOTH internal & external candidates!)
        const shared = sharedDocs[spec.type] as ApplicationDocument | undefined;
        if (shared && isDocumentProvided(shared)) {
          reused.add(spec.type);
          return {
            ...shared,
            id: `common-${spec.type}-${idx}`,
            label: spec.label,
            isRequired: spec.isRequired,
            status: shared.status === 'valide' ? 'valide' : 'en_attente',
            provenance: shared.provenance || 'fourni_candidat',
          };
        }

        // 3. Otherwise missing — prompt once in Section 3A
        return {
          id: `common-${spec.type}-${idx}`,
          type: spec.type,
          label: spec.label,
          fileName: '',
          fileSize: 0,
          fileUrl: '',
          isRequired: spec.isRequired,
          status: 'manquant',
          provenance: 'fourni_candidat',
          uploadedAt: '',
        };
      });

      setReusedDocTypes(reused);
      setCommonDocs(builtCommonDocs);
    };

    loadVaultAndApogee();
    return () => {
      active = false;
    };
  }, [currentUser?.id, currentUser?.cne, currentUser?.cin, currentUser?.studentOriginType]);

  // Ensure every selected subject has its exact subject-specific documents initialized
  useEffect(() => {
    setSubjectSpecificDocsMap((prev) => {
      const next: Record<string, ApplicationDocument[]> = { ...prev };
      for (const subId of selectedSubjectIds) {
        if (next[subId]) continue;
        const subject = subjects.find((s) => s.id === subId);
        const specs = getRequiredDocumentsForSubject(subject).filter(
          (spec) => spec.category === 'specifique_sujet'
        );
        next[subId] = specs.map((spec, idx) => ({
          id: `spec-${subId}-${spec.type}-${idx}`,
          type: spec.type,
          label: spec.label,
          fileName: '',
          fileSize: 0,
          fileUrl: '',
          isRequired: spec.isRequired,
          status: 'manquant',
          provenance: 'fourni_candidat',
          uploadedAt: '',
        }));
      }
      return next;
    });
  }, [selectedSubjectIds, subjects]);

  const selectedSubjects = useMemo(
    () =>
      selectedSubjectIds
        .map((id) => subjects.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s)),
    [selectedSubjectIds, subjects]
  );

  const duplicateSubjects = useMemo(
    () => selectedSubjects.filter((s) => existingSubjectIdSet.has(s.id)),
    [selectedSubjects, existingSubjectIdSet]
  );

  const eligibleSubjectsToSubmit = useMemo(
    () => selectedSubjects.filter((s) => !existingSubjectIdSet.has(s.id)),
    [selectedSubjects, existingSubjectIdSet]
  );

  const availableSubjectsToAdd = useMemo(
    () =>
      subjects.filter(
        (s) => !selectedSubjectIds.includes(s.id) && !existingSubjectIdSet.has(s.id)
      ),
    [subjects, selectedSubjectIds, existingSubjectIdSet]
  );

  const handleCommonDocumentUpload = (
    docId: string,
    file: { fileName: string; fileSize: number; fileUrl: string }
  ) => {
    let uploadedDoc: ApplicationDocument | null = null;
    setCommonDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d;
        uploadedDoc = {
          ...d,
          fileName: file.fileName,
          fileSize: file.fileSize,
          fileUrl: file.fileUrl,
          status: 'en_attente',
          provenance: 'fourni_candidat',
          isDemoApogee: false,
          uploadedAt: new Date().toISOString(),
          rejectionReason: undefined,
        };
        return uploadedDoc;
      })
    );
    if (currentUser && uploadedDoc) {
      storageService.saveCandidateSharedDocument(currentUser.id, uploadedDoc, {
        syncPendingApps: false,
      });
      refreshUserData();
    }
  };

  const handleSubjectSpecificUpload = (
    subjectId: string,
    docId: string,
    file: { fileName: string; fileSize: number; fileUrl: string }
  ) => {
    setSubjectSpecificDocsMap((prev) => ({
      ...prev,
      [subjectId]: (prev[subjectId] || []).map((d) =>
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
              rejectionReason: undefined,
            }
          : d
      ),
    }));
  };

  const handleGenerateDemoMissingDocs = () => {
    const fullName = `${currentUser?.firstName || 'Candidat'} ${currentUser?.lastName || 'USMBA'}`;
    const updatedCommon: ApplicationDocument[] = commonDocs.map((d) =>
      isDocumentProvided(d)
        ? d
        : {
            ...d,
            fileName: `Demo_${d.type}_${currentUser?.lastName || 'Candidat'}.pdf`,
            fileSize: 195000,
            fileUrl: createDemoPdfDataUrl(`Piece justificative (${d.type})`, [
              `Candidat (Simulation) : ${fullName}`,
              `CIN : ${currentUser?.cin || 'DEMO'}`,
              `Piece : ${d.label}`,
              'Document fictif genere pour demonstration academique',
            ]),
            status: 'en_attente',
            provenance: 'fourni_candidat',
            uploadedAt: new Date().toISOString(),
          }
    );
    setCommonDocs(updatedCommon);
    if (currentUser) {
      for (const doc of updatedCommon) {
        if (isCommonDocumentType(doc.type) && doc.provenance === 'fourni_candidat') {
          storageService.saveCandidateSharedDocument(currentUser.id, doc, {
            syncPendingApps: false,
          });
        }
      }
      refreshUserData();
    }

    setSubjectSpecificDocsMap((prev) => {
      const next = { ...prev };
      for (const sub of eligibleSubjectsToSubmit) {
        next[sub.id] = (next[sub.id] || []).map((d) =>
          isDocumentProvided(d)
            ? d
            : {
                ...d,
                fileName: `Demo_${d.type}_${sub.id}_${currentUser?.lastName || 'Candidat'}.pdf`,
                fileSize: 210000,
                fileUrl: createDemoPdfDataUrl(`Piece specifique (${d.type})`, [
                  `Candidat (Simulation) : ${fullName}`,
                  `Sujet : ${sub.title}`,
                  `Piece : ${d.label}`,
                  'Document fictif specifique au sujet',
                ]),
                status: 'en_attente',
                provenance: 'fourni_candidat',
                uploadedAt: new Date().toISOString(),
              }
        );
      }
      return next;
    });
  };

  const missingCommonCount = commonDocs.filter((d) => d.isRequired && !isDocumentProvided(d)).length;
  const missingSpecificCount = eligibleSubjectsToSubmit.reduce((acc, sub) => {
    const docs = subjectSpecificDocsMap[sub.id] || [];
    return acc + docs.filter((d) => d.isRequired && !isDocumentProvided(d)).length;
  }, 0);
  const totalMissingCount = missingCommonCount + missingSpecificCount;

  const submitApplications = async (allowIncomplete: boolean) => {
    setErrorMsg(null);

    if (eligibleSubjectsToSubmit.length === 0) {
      setErrorMsg(
        duplicateSubjects.length > 0
          ? 'Tous les sujets sélectionnés ont déjà une candidature active sur votre compte.'
          : 'Veuillez sélectionner au moins un sujet de doctorat.'
      );
      return;
    }

    if (!academicData.masterOriginUniversity.trim() || !academicData.masterSpecialty.trim()) {
      setErrorMsg(
        "Veuillez renseigner votre université d'origine et l'intitulé exact de votre spécialité."
      );
      return;
    }

    if (!allowIncomplete && totalMissingCount > 0) {
      setErrorMsg(
        `Dossier incomplet : ${totalMissingCount} pièce(s) obligatoire(s) manquante(s). Téléversez les pièces ou enregistrez en mode « Dossier incomplet » pour compléter plus tard.`
      );
      return;
    }

    setIsSubmitting(true);
    const createdApps: CandidateApplication[] = [];
    const nowIso = new Date().toISOString();

    for (let idx = 0; idx < eligibleSubjectsToSubmit.length; idx++) {
      const subject = eligibleSubjectsToSubmit[idx];
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const refNumber = `USMBA-DOC-2026-${randomNum}`;
      const appId = `app-${Date.now()}-${idx}`;

      const clonedCommon: ApplicationDocument[] = commonDocs.map((d, dIdx) => ({
        ...d,
        id: `doc-${appId}-c-${dIdx}`,
        status: !isDocumentProvided(d)
          ? 'manquant'
          : d.provenance === 'recupere_administration'
          ? 'valide'
          : d.status === 'valide'
          ? 'valide'
          : 'en_attente',
      }));

      const specificDocs: ApplicationDocument[] = (subjectSpecificDocsMap[subject.id] || []).map(
        (d, dIdx) => ({
          ...d,
          id: `doc-${appId}-s-${dIdx}`,
          status: !isDocumentProvided(d) ? 'manquant' : 'en_attente',
        })
      );

      const allAppDocs = [...clonedCommon, ...specificDocs];
      const summary = summarizeApplicationDocuments(allAppDocs);
      const finalStatus = summary.isComplete ? 'soumise' : 'incomplete';

      const newApp: CandidateApplication = {
        id: appId,
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
        subjectId: subject.id,
        subjectTitle: subject.title,
        laboratoryId: subject.laboratoryId,
        establishmentId: subject.establishmentId,
        supervisorName: subject.supervisorName || subject.professeur_nom || 'Non attribué',
        discipline: subject.discipline,
        masterOriginUniversity: academicData.masterOriginUniversity.trim(),
        masterSpecialty: academicData.masterSpecialty.trim(),
        masterGraduationYear: Number(academicData.masterGraduationYear),
        masterMention: academicData.masterMention,
        status: finalStatus,
        assignedReviewerId: 'usr-admin-1',
        assignedReviewerName: 'Bureau des Études Doctorales (Instruction)',
        documents: allAppDocs,
        correctionRequests: [],
        statusHistory: [
          {
            id: `sh-${Date.now()}-${idx}`,
            status: finalStatus,
            comment: summary.isComplete
              ? 'Dossier de candidature complet soumis par le candidat.'
              : `Dossier enregistré avec ${summary.missingDocs.length} pièce(s) manquante(s) à compléter.`,
            changedBy: `${currentUser?.firstName} ${currentUser?.lastName}`,
            timestamp: nowIso,
          },
        ],
        submittedAt: nowIso,
        updatedAt: nowIso,
      };

      storageService.saveApplication(newApp, {
        id: currentUser?.id || 'candidat',
        name: `${currentUser?.firstName} ${currentUser?.lastName}`,
        role: 'candidat',
      });

      let finalSavedApp = newApp;
      try {
        const resp = await fetch('/api/applications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify(newApp),
        });
        if (resp.ok) {
          const respJson = await resp.json();
          if (respJson?.application) {
            finalSavedApp = respJson.application;
            storageService.saveApplication(finalSavedApp, {
              id: currentUser?.id || 'candidat',
              name: `${currentUser?.firstName} ${currentUser?.lastName}`,
              role: 'candidat',
            });
          }
        }
      } catch {
        // Local persistence remains authoritative
      }

      storageService.addNotification({
        targetRole: 'candidat',
        userId: currentUser?.id,
        title: `${summary.isComplete ? 'Dépôt confirmé' : 'Dossier enregistré (Incomplet)'} — ${refNumber}`,
        message: `Candidature enregistrée pour le sujet "${subject.title.substring(0, 45)}...".`,
        category: 'candidature',
        link: `/candidat/mon-dossier?appId=${finalSavedApp.id}`,
      });

      createdApps.push(finalSavedApp);
    }

    if (currentUser) {
      const providedCommon = commonDocs.filter((d) => isDocumentProvided(d));
      for (const doc of providedCommon) {
        storageService.saveCandidateSharedDocument(currentUser.id, doc, {
          syncPendingApps: false,
        });
      }
      storageService.saveUser({
        ...storageService.getUserById(currentUser.id)!,
        originEstablishment:
          currentUser.originEstablishment || academicData.masterOriginUniversity.trim(),
        masterSpecialty: currentUser.masterSpecialty || academicData.masterSpecialty.trim(),
      });
      refreshUserData();
    }

    sessionStorage.removeItem(SELECTED_SUBJECTS_STORAGE_KEY);
    setIsSubmitting(false);
    setSubmittedApps(createdApps);
  };

  if (submittedApps.length > 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <div className="bg-white rounded-3xl border border-emerald-200 shadow-xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Candidature(s) enregistrée(s)
              </span>
              <h1 className="text-2xl font-black text-slate-900 mt-1">
                {submittedApps.length} dossier(s) de candidature créé(s)
              </h1>
            </div>
          </div>

          <div className="space-y-3">
            {submittedApps.map((app) => {
              const summary = summarizeApplicationDocuments(app.documents);
              return (
                <div
                  key={app.id}
                  className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-black text-teal-800 bg-white px-2.5 py-0.5 rounded-md border border-teal-200">
                        {app.referenceNumber}
                      </span>
                      <StatusBadge status={app.status} size="sm" />
                      <span className="text-[11px] text-slate-500">
                        {summary.providedRequiredCount} / {summary.totalRequired} pièces fournies
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900">{app.subjectTitle}</div>
                    <div className="text-[11px] text-slate-500">
                      Directeur : {app.supervisorName} • Labo : {app.laboratoryId.toUpperCase()}
                    </div>
                  </div>
                  <Link
                    to={`/candidat/mon-dossier?appId=${app.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3.5 py-2 rounded-xl shrink-0 whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Voir l&apos;accusé</span>
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => window.print()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 px-5 py-2.5 rounded-xl text-xs font-bold transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer le récapitulatif</span>
            </button>

            <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
              <Link
                to="/sujets"
                className="inline-flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors"
              >
                Retour au catalogue
              </Link>
              <button
                type="button"
                onClick={() => navigate(`/candidat/dashboard?appId=${submittedApps[0].id}`)}
                className="inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-xs"
              >
                <span>Ouvrir mon tableau de bord</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Compact Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-2">
        <div className="inline-flex items-center gap-2 bg-teal-50 border border-teal-200 px-3 py-0.5 rounded-full text-teal-800 text-xs font-semibold">
          <FileCheck2 className="w-3.5 h-3.5" />
          <span>Candidature simultanée multi-sujets • Mode démonstration académique</span>
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Dépôt de Candidature ({eligibleSubjectsToSubmit.length} sujet(s) sélectionné(s))
        </h1>
        <p className="text-xs text-slate-600 leading-relaxed">
          Vos pièces communes déjà enregistrées dans votre dossier personnel sont réutilisées automatiquement pour tous les sujets sélectionnés. Complétez uniquement les pièces manquantes ou spécifiques à chaque sujet.
        </p>
      </div>

      {/* Simulated APOGÉE & Vault Info Banner */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-2 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <Building2 className="w-4 h-4 text-teal-600" />
            <span>
              Profil :{' '}
              {currentUser?.studentOriginType === 'interne_usmba'
                ? 'Étudiant interne USMBA'
                : 'Candidat externe / autre établissement'}
            </span>
          </div>
          {apogeeResult && (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-slate-50 text-slate-700 border-slate-200">
              {apogeeResult.isDemoData
                ? 'Simulation APOGÉE (Démo)'
                : 'Dossier personnel centralisé actif'}
            </span>
          )}
        </div>
        <p className="text-slate-600 flex items-start gap-2">
          <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <span>
            {apogeeLoading
              ? 'Chargement de votre coffre personnel...'
              : reusedDocTypes.size > 0
              ? `${reusedDocTypes.size} pièce(s) commune(s) déjà disponible(s) dans votre dossier personnel / démo ont été réutilisées automatiquement.`
              : 'Téléversez vos pièces communes une seule fois ci-dessous : elles seront conservées dans votre dossier personnel pour toutes vos candidatures.'}
          </span>
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitApplications(false);
        }}
        className="space-y-6"
      >
        {/* Step 1: Selected Subjects */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">
                1
              </span>
              <h3 className="font-bold text-sm text-slate-900">
                Sujets de thèse sélectionnés ({selectedSubjects.length})
              </h3>
            </div>
            <Link to="/sujets" className="text-xs font-bold text-teal-700 hover:underline">
              + Choisir depuis le catalogue
            </Link>
          </div>

          <div className="space-y-2.5">
            {selectedSubjects.map((sub) => {
              const isDup = existingSubjectIdSet.has(sub.id);
              return (
                <div
                  key={sub.id}
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                    isDup
                      ? 'bg-amber-50 border-amber-300'
                      : 'bg-teal-50/40 border-teal-200'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs font-bold text-slate-900">{sub.title}</div>
                    <div className="text-[11px] text-slate-600">
                      {sub.domaine || sub.discipline} • Labo : {sub.laboratoryId.toUpperCase()} • Dir. :{' '}
                      {sub.supervisorName || 'Non attribué'}
                    </div>
                    {isDup && (
                      <div className="text-[11px] font-bold text-amber-800">
                        Déjà postulé (ignoré à la soumission pour éviter un doublon)
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedSubjectIds((prev) => prev.filter((id) => id !== sub.id))
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-800 shrink-0 self-start sm:self-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Retirer</span>
                  </button>
                </div>
              );
            })}
          </div>

          {availableSubjectsToAdd.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-100">
              <select
                value={addSubjectPickerId}
                onChange={(e) => setAddSubjectPickerId(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Ajouter un autre sujet à cette candidature groupée...</option>
                {availableSubjectsToAdd.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.discipline}] {s.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!addSubjectPickerId}
                onClick={() => {
                  if (!addSubjectPickerId) return;
                  setSelectedSubjectIds((prev) => [...prev, addSubjectPickerId]);
                  setAddSubjectPickerId('');
                }}
                className="inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold px-4 py-2 rounded-xl text-xs whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter</span>
              </button>
            </div>
          )}
        </div>

        {/* Step 2: Cursus Académique Master (filled once) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">
              2
            </span>
            <h3 className="font-bold text-sm text-slate-900">
              Cursus Master ou Diplôme Équivalent (Saisi une seule fois)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Université / Établissement d&apos;origine *
              </label>
              <input
                type="text"
                required
                placeholder="Ex : USMBA - FSDM, Université Hassan II..."
                value={academicData.masterOriginUniversity}
                onChange={(e) =>
                  setAcademicData({ ...academicData, masterOriginUniversity: e.target.value })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Spécialité / Filière Master *
              </label>
              <input
                type="text"
                required
                placeholder="Ex : Intelligence Artificielle, Droit Public..."
                value={academicData.masterSpecialty}
                onChange={(e) =>
                  setAcademicData({ ...academicData, masterSpecialty: e.target.value })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Année d&apos;obtention</label>
              <input
                type="number"
                min="2015"
                max="2026"
                required
                value={academicData.masterGraduationYear}
                onChange={(e) =>
                  setAcademicData({
                    ...academicData,
                    masterGraduationYear: Number(e.target.value),
                  })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Mention obtenue</label>
              <select
                value={academicData.masterMention}
                onChange={(e) =>
                  setAcademicData({
                    ...academicData,
                    masterMention: e.target.value as
                      | 'Très Bien'
                      | 'Bien'
                      | 'Assez Bien'
                      | 'Passable',
                  })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="Très Bien">Très Bien (16/20 et plus)</option>
                <option value="Bien">Bien (14 à 15.99/20)</option>
                <option value="Assez Bien">Assez Bien (12 à 13.99/20)</option>
                <option value="Passable">Passable (10 à 11.99/20)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Helper for academic demo testing */}
        {totalMissingCount > 0 && (
          <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2 text-indigo-950">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong>Mode démonstration académique :</strong> Téléversez vos propres fichiers ci-dessous ou générez des justificatifs PDF fictifs pour les {totalMissingCount} pièce(s) manquante(s).
              </span>
            </div>
            <button
              type="button"
              onClick={handleGenerateDemoMissingDocs}
              className="shrink-0 bg-indigo-700 hover:bg-indigo-800 text-white font-bold px-3.5 py-2 rounded-xl text-[11px] transition-colors whitespace-nowrap"
            >
              Générer les pièces fictives manquantes
            </button>
          </div>
        )}

        {/* Step 3A: Centralized Common Documents Vault */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">
                3A
              </span>
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                  <FolderCheck className="w-4 h-4 text-teal-700" />
                  <span>Dossier Personnel — Pièces Communes ({commonDocs.length - missingCommonCount} / {commonDocs.length})</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Mutualisées automatiquement pour tous vos sujets. Vous ne déposez chaque pièce manquante qu&apos;une seule fois.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            {commonDocs.map((doc) => (
              <DocumentUploader
                key={doc.id}
                document={doc}
                onUpload={handleCommonDocumentUpload}
              />
            ))}
          </div>
        </div>

        {/* Step 3B: Per-subject Specific Documents */}
        {eligibleSubjectsToSubmit.map((subject, idx) => {
          const specificDocs = subjectSpecificDocsMap[subject.id] || [];
          const providedCount = specificDocs.filter((d) => isDocumentProvided(d)).length;
          return (
            <div
              key={subject.id}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    3B.{idx + 1}
                  </span>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      Pièces spécifiques — {subject.title}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Pièces propres à ce sujet ({providedCount} / {specificDocs.length} prête(s))
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                {specificDocs.map((doc) => (
                  <DocumentUploader
                    key={doc.id}
                    document={doc}
                    onUpload={(docId, f) => handleSubjectSpecificUpload(subject.id, docId, f)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Submission Bar */}
        <div className="bg-slate-900 p-6 rounded-2xl text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
          <div className="text-xs space-y-1 text-center sm:text-left">
            <div className="font-bold text-sm text-teal-300">
              {eligibleSubjectsToSubmit.length} candidature(s) indépendante(s) prête(s) à créer
            </div>
            <p className="text-slate-300 text-[11px]">
              {totalMissingCount > 0
                ? `${totalMissingCount} pièce(s) reste(nt) manquante(s) : complétez-les ou enregistrez en « Dossier incomplet » pour finir plus tard.`
                : 'Toutes les pièces communes et spécifiques sont complètes.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2.5 shrink-0">
            {totalMissingCount > 0 && (
              <button
                type="button"
                disabled={isSubmitting || eligibleSubjectsToSubmit.length === 0}
                onClick={() => submitApplications(true)}
                className="bg-amber-400 hover:bg-amber-300 disabled:bg-slate-700 text-slate-950 font-bold px-4 py-3 rounded-xl text-xs transition-colors whitespace-nowrap cursor-pointer"
              >
                Enregistrer en dossier incomplet
              </button>
            )}
            <button
              type="submit"
              disabled={
                isSubmitting ||
                eligibleSubjectsToSubmit.length === 0 ||
                totalMissingCount > 0
              }
              className="bg-teal-500 hover:bg-teal-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-extrabold px-6 py-3 rounded-xl text-xs transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <span>
                {isSubmitting
                  ? 'Enregistrement...'
                  : `Soumettre (${eligibleSubjectsToSubmit.length} dossier(s))`}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
