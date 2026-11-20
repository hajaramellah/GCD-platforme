import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CheckSquare,
  Upload,
  CheckCircle2,
  ArrowRight,
  FileText,
  Eye,
  Download,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { AdministrativeRegistration } from '../../types';
import { DocumentViewerModal } from '../../components/common/DocumentViewerModal';
import {
  downloadProtectedDocument,
  ViewableDocumentInput
} from '../../services/documentService';

export const CandidateRegistrationChecklist: React.FC = () => {
  const { currentUser, currentRole, sessionToken } = useAuth();
  const [searchParams] = useSearchParams();
  const queryAppId = searchParams.get('appId');

  const registrations = storageService.getAdministrativeRegistrations();

  // Strict Candidate Application Isolation — locate admitted application(s)
  const myApps = useMemo(
    () =>
      storageService.getCandidateApplicationsStrict(
        currentUser?.id,
        currentUser?.email,
        currentUser?.cin
      ),
    [currentUser?.id, currentUser?.email, currentUser?.cin]
  );

  const admittedApps = myApps.filter((a) => a.status === 'admise');
  const myApp = admittedApps.find((a) => a.id === queryAppId) || admittedApps[0];

  const existingReg = myApp
    ? registrations.find((r) => r.candidateId === myApp.candidateId || r.applicationId === myApp.id)
    : null;

  const defaultLabels = [
    { id: 'cd-1', label: 'Originaux des Diplômes (Baccalauréat, Licence, Master) certifiés' },
    { id: 'cd-2', label: 'Charte des Thèses USMBA paraphée et signée par les encadrants' },
    { id: 'cd-3', label: "4 Photos d'identité récentes (Format passeport)" },
    { id: 'cd-4', label: "Attestation d'assurance responsabilité civile étudiant en cours" },
    { id: 'cd-5', label: "Engagement sur l'honneur de respect du règlement intérieur" }
  ];

  const [docsState, setDocsState] = useState(
    defaultLabels.map((item, idx) => {
      const existingDoc = existingReg?.documents?.[idx];
      return {
        id: existingDoc?.id || item.id,
        label: item.label,
        fileName: existingDoc?.fileName || '',
        fileUrl:
          existingDoc?.fileUrl ||
          (existingReg && existingDoc?.id
            ? `/api/registrations/${existingReg.id}/documents/${existingDoc.id}/content`
            : ''),
        status: existingDoc?.status || 'manquant',
        required: true
      };
    })
  );

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ViewableDocumentInput | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  const handleFileUpload = (docId: string, file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'docx'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !allowedExtensions.includes(ext)) {
      setUploadError('Format non autorisé. Formats acceptés : PDF, JPG, JPEG, PNG, DOCX.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Le fichier dépasse la taille maximale autorisée (5 Mo).');
      return;
    }

    setUploadingDocId(docId);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      let finalUrl = dataUrl;
      try {
        const resp = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
          },
          credentials: 'include',
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            dataUrl,
            docType: 'inscription'
          })
        });
        if (resp.ok) {
          const resData = await resp.json();
          if (resData.protectedUrl) {
            finalUrl = resData.protectedUrl;
          }
        }
      } catch {
        // Keep local dataUrl fallback
      } finally {
        setUploadingDocId(null);
      }

      setDocsState((prev) =>
        prev.map((d) =>
          d.id === docId
            ? { ...d, fileName: file.name, fileUrl: finalUrl, status: 'fourni' }
            : d
        )
      );
    };
    reader.onerror = () => {
      setUploadingDocId(null);
      setUploadError('Impossible de lire ce fichier sur votre appareil.');
    };
    reader.readAsDataURL(file);
  };

  const toChecklistViewableDoc = (doc: (typeof docsState)[number]): ViewableDocumentInput => ({
    id: doc.id,
    label: doc.label,
    fileName: doc.fileName || `${doc.label}.pdf`,
    fileUrl: doc.fileUrl,
    status: doc.status,
    ownerId: currentUser?.id,
    ownerEmail: currentUser?.email,
    ownerCin: currentUser?.cin,
  });

  const handleSubmitRegistration = () => {
    if (!myApp) return;

    const newReg: AdministrativeRegistration = {
      id: existingReg?.id || `reg-${Date.now()}`,
      applicationId: myApp.id,
      candidateId: myApp.candidateId,
      studentName: myApp.candidateName,
      cin: myApp.cin,
      cne: myApp.cne,
      subjectTitle: myApp.subjectTitle,
      laboratoryId: myApp.laboratoryId,
      establishmentId: myApp.establishmentId,
      supervisorName: myApp.supervisorName,
      status: 'en_cours_verification',
      academicYear: '2026-2027',
      submittedAt: new Date().toISOString(),
      documents: docsState.map((d) => ({
        id: d.id,
        label: d.label,
        fileName: d.fileName,
        fileUrl: d.fileUrl || undefined,
        status: (d.status === 'conforme' ? 'conforme' : d.fileName ? 'fourni' : 'manquant') as 'conforme' | 'fourni' | 'manquant' | 'rejete',
        required: d.required
      }))
    };

    storageService.saveAdministrativeRegistration(newReg, {
      id: currentUser?.id || 'candidat',
      name: `${currentUser?.firstName} ${currentUser?.lastName}`,
      role: 'candidat'
    });

    storageService.addNotification({
      targetRole: 'administration',
      title: `Dossier d'inscription déposé — ${myApp.candidateName}`,
      message: `Le candidat admis ${myApp.candidateName} (${myApp.cin}) a transmis son dossier d'inscription administrative définitive.`,
      category: 'inscription',
      link: '/administration/inscriptions'
    });

    setIsSaved(true);
  };

  if (!myApp || myApp.status !== 'admise') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
          <CheckSquare className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">
          Espace d&apos;inscription administrative définitive
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Cette démarche est réservée aux candidats déclarés admis sur la liste principale après délibération de la commission de sélection.
        </p>
        <Link
          to="/candidat/dashboard"
          className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-colors shadow-xs"
        >
          <span>Retour à mon espace candidat</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 rounded-3xl p-8 text-white shadow-xl space-y-3">
        <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/40 px-3 py-1 rounded-full text-emerald-300 text-xs font-semibold">
          <CheckSquare className="w-3.5 h-3.5" />
          Inscription Administrative Personnalisée
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Checklist d'Inscription Définitive au Doctorat
        </h1>
        <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
          Vos informations validées lors de la candidature ont été automatiquement pré-remplies.
          Vérifiez vos données et déposez les pièces requises pour finaliser votre dossier.
        </p>
      </div>

      {isSaved ? (
        <div className="p-8 bg-emerald-50 border border-emerald-200 rounded-3xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-emerald-950">
            Dossier d'inscription administrative transmis !
          </h2>
          <p className="text-xs text-emerald-800 max-w-md mx-auto leading-relaxed">
            Vos documents administratifs sont en cours de contrôle de conformité par le service de scolarité de l'établissement. Votre attestation d'inscription sera délivrée dès validation finale.
          </p>
          <div className="pt-2">
            <Link
              to="/candidat/dashboard"
              className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-colors shadow-xs"
            >
              <span>Retour à mon tableau de bord</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Prefilled Profile Card */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-500">
                1. Données civiles & universitaires pré-remplies
              </span>
              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-md border border-emerald-200">
                Données authentifiées
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Nom complet</span>
                <span className="font-bold text-slate-900">{myApp.candidateName}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block text-[10px]">CIN / CNE</span>
                <span className="font-mono font-bold text-teal-800">{myApp.cin} / {myApp.cne}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Adresse e-mail Google</span>
                <span className="font-mono text-slate-800 truncate block">{myApp.candidateEmail}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Directeur de Thèse</span>
                <span className="font-bold text-slate-800">{myApp.supervisorName}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Laboratoire d'accueil</span>
                <span className="font-bold text-slate-800 uppercase">{myApp.laboratoryId}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Année universitaire</span>
                <span className="font-bold text-slate-800">2026-2027</span>
              </div>
            </div>
          </div>

          {/* Checklist of mandatory documents */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-500">
                2. Pièces administratives obligatoires à fournir
              </span>
              <span className="text-xs text-slate-500">
                {docsState.filter((d) => d.status === 'conforme' || d.status === 'fourni').length} / {docsState.length} pièce(s) prête(s)
              </span>
            </div>

            {uploadError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="space-y-3">
              {docsState.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                      <span className="font-bold text-slate-900">{doc.label}</span>
                    </div>
                    {doc.fileName && (
                      <span className="text-[11px] font-mono text-slate-500 block pl-6">
                        Fichier joint : {doc.fileName}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                    {doc.fileUrl && (
                      <>
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(toChecklistViewableDoc(doc))}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 hover:text-teal-950 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1.5 rounded-xl transition-colors whitespace-nowrap shrink-0"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Consulter</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadProtectedDocument(toChecklistViewableDoc(doc), {
                              sessionToken,
                              currentUserId: currentUser?.id,
                              currentUserEmail: currentUser?.email,
                              currentUserCin: currentUser?.cin,
                              activeRole: currentRole,
                            }).catch(() => undefined)
                          }
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 px-2 py-1.5 rounded-xl transition-colors whitespace-nowrap shrink-0"
                          title="Télécharger une copie (action secondaire)"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    {doc.status === 'conforme' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Conforme
                      </span>
                    ) : (
                      <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 px-3 py-1.5 rounded-xl transition-colors shadow-2xs whitespace-nowrap shrink-0">
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {uploadingDocId === doc.id
                            ? 'Envoi...'
                            : doc.fileName
                            ? 'Remplacer'
                            : 'Téléverser'}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.docx"
                          onChange={(e) => handleFileUpload(doc.id, e.target.files?.[0])}
                        />
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <Link
                to="/candidat/dashboard"
                className="text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Retour
              </Link>

              <button
                type="button"
                onClick={handleSubmitRegistration}
                className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-colors shadow-xs"
              >
                <span>Confirmer et soumettre mon inscription</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
      <DocumentViewerModal
        document={previewDoc}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  );
};
