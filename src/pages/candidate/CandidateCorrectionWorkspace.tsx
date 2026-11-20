import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Clock,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { ApplicationDocument, CorrectionRequest } from '../../types';
import { DocumentUploader } from '../../components/common/DocumentUploader';
import {
  isCommonDocumentType,
  isDocumentProvided,
  summarizeApplicationDocuments
} from '../../utils/documentRequirements';

export const CandidateCorrectionWorkspace: React.FC = () => {
  const { currentUser, sessionToken, refreshUserData } = useAuth();
  const [searchParams] = useSearchParams();
  const queryAppId = searchParams.get('appId');

  const myApps = useMemo(
    () =>
      storageService.getCandidateApplicationsStrict(
        currentUser?.id,
        currentUser?.email,
        currentUser?.cin
      ),
    [currentUser?.id, currentUser?.email, currentUser?.cin]
  );

  const correctionApps = useMemo(
    () =>
      myApps.filter(
        (a) =>
          a.status === 'correction_demandee' ||
          a.status === 'incomplete' ||
          summarizeApplicationDocuments(a.documents).hasIssues
      ),
    [myApps]
  );

  const [selectedAppId, setSelectedAppId] = useState<string>(
    queryAppId || correctionApps[0]?.id || ''
  );

  useEffect(() => {
    if (queryAppId && correctionApps.some((a) => a.id === queryAppId)) {
      setSelectedAppId(queryAppId);
    } else if (!correctionApps.some((a) => a.id === selectedAppId)) {
      setSelectedAppId(correctionApps[0]?.id || '');
    }
  }, [queryAppId, currentUser?.id, correctionApps]);

  const app = correctionApps.find((a) => a.id === selectedAppId) || correctionApps[0];

  const latestRequest: CorrectionRequest = app?.correctionRequests?.[0] || {
    id: 'req-active',
    applicationId: app?.id || '',
    requestedBy: 'Administration Scolarité CEDoc USMBA',
    requestedAt: app?.updatedAt || new Date().toISOString(),
    deadline: '2026-11-25T23:59:59Z',
    comment:
      app?.status === 'incomplete'
        ? 'Des pièces obligatoires sont manquantes sur ce dossier. Veuillez les téléverser pour finaliser votre candidature.'
        : 'Des pièces justificatives ont été signalées comme non conformes ou nécessitant un complément par l\'administration.',
    missingOrInvalidDocs: [],
    isResolved: false
  };

  const [documents, setDocuments] = useState<ApplicationDocument[]>(app?.documents || []);
  const [isResubmitted, setIsResubmitted] = useState(false);

  useEffect(() => {
    setDocuments(app?.documents || []);
    setIsResubmitted(false);
  }, [app?.id]);

  const handleDocumentUpload = (
    docId: string,
    file: { fileName: string; fileSize: number; fileUrl: string }
  ) => {
    let uploadedDoc: ApplicationDocument | null = null;
    setDocuments((prev) =>
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
          rejectionReason: undefined,
          uploadedAt: new Date().toISOString()
        };
        return uploadedDoc;
      })
    );

    if (currentUser && uploadedDoc && isCommonDocumentType((uploadedDoc as ApplicationDocument).type)) {
      storageService.saveCandidateSharedDocument(currentUser.id, uploadedDoc, {
        syncPendingApps: false
      });
      refreshUserData();
    }
  };

  const docsToFix = documents.filter(
    (d) =>
      latestRequest.missingOrInvalidDocs.includes(d.type) ||
      d.status === 'rejete' ||
      d.status === 'complement_requis' ||
      d.status === 'manquant' ||
      !d.fileName
  );

  const docSummary = summarizeApplicationDocuments(documents);

  const handleResubmit = async () => {
    if (!app) return;

    const updatedDocs = documents.map((d) =>
      (d.status === 'rejete' || d.status === 'complement_requis' || d.status === 'manquant') &&
      isDocumentProvided({ status: 'en_attente', fileName: d.fileName })
        ? { ...d, status: 'en_attente' as const }
        : !d.fileName
        ? { ...d, status: 'manquant' as const }
        : d
    );

    const postSummary = summarizeApplicationDocuments(updatedDocs);
    const nextStatus = postSummary.isComplete
      ? app.status === 'incomplete'
        ? ('soumise' as const)
        : ('corrigee' as const)
      : app.status === 'correction_demandee' &&
        postSummary.rejectedDocs.length === 0 &&
        postSummary.complementDocs.length === 0
      ? ('incomplete' as const)
      : app.status;

    const updatedRequests = postSummary.isComplete
      ? app.correctionRequests.map((cr) =>
          !cr.isResolved ? { ...cr, isResolved: true, resolvedAt: new Date().toISOString() } : cr
        )
      : app.correctionRequests;

    const updatedApp = {
      ...app,
      status: nextStatus,
      documents: updatedDocs,
      correctionRequests: updatedRequests,
      statusHistory: [
        {
          id: `sh-${Date.now()}`,
          status: nextStatus,
          comment: postSummary.isComplete
            ? 'Pièces rectifiées et complétées soumises par le candidat.'
            : `Mise à jour partielle (${postSummary.providedRequiredCount}/${postSummary.totalRequired} pièces fournies).`,
          changedBy: `${currentUser?.firstName} ${currentUser?.lastName}`,
          timestamp: new Date().toISOString()
        },
        ...app.statusHistory
      ],
      updatedAt: new Date().toISOString()
    };

    storageService.saveApplication(updatedApp, {
      id: currentUser?.id || 'candidat',
      name: `${currentUser?.firstName} ${currentUser?.lastName}`,
      role: 'candidat'
    });

    // Also persist common docs into vault & sync backend
    if (currentUser) {
      for (const doc of updatedDocs) {
        if (isCommonDocumentType(doc.type) && isDocumentProvided(doc)) {
          storageService.saveCandidateSharedDocument(currentUser.id, doc, {
            syncPendingApps: false
          });
        }
      }
      refreshUserData();
    }

    try {
      await fetch(`/api/applications/${app.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify(updatedApp)
      });
    } catch {
      // Offline fallback remains persisted
    }

    storageService.addNotification({
      targetRole: 'administration',
      title: `Régularisation effectuée — Réf ${app.referenceNumber}`,
      message: `Le candidat ${app.candidateName} a mis à jour les pièces demandées.`,
      category: 'candidature',
      link: '/administration/dossiers'
    });

    setIsResubmitted(true);
  };

  if (!app) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Aucune demande de régularisation en attente</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Vos dossiers ne présentent aucune pièce manquante ou rejetée. Suivez leur avancement dans votre espace candidat.
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
      <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-slate-900 rounded-3xl p-8 text-white shadow-xl space-y-3">
        <div className="inline-flex items-center gap-2 bg-rose-500/20 border border-rose-400/40 px-3 py-1 rounded-full text-rose-300 text-xs font-semibold">
          <AlertTriangle className="w-3.5 h-3.5" />
          Régularisation &amp; Complément de Dossier
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Compléter ou Corriger mon Dossier
        </h1>
        <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
          Consultez les motifs formulés sur vos pièces rejetées ou manquantes et téléversez les justificatifs attendus. Les pièces communes sont également enregistrées dans votre coffre personnel.
        </p>
      </div>

      {correctionApps.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-600 px-2">Dossier concerné :</span>
          {correctionApps.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedAppId(item.id)}
              className={`text-xs px-3 py-1.5 rounded-xl font-semibold border transition-colors ${
                app.id === item.id
                  ? 'bg-rose-700 text-white border-rose-700'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {item.referenceNumber} — {item.discipline}
            </button>
          ))}
        </div>
      )}

      {isResubmitted ? (
        <div className="p-8 bg-emerald-50 border border-emerald-200 rounded-3xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-emerald-950">
            Modifications enregistrées sur le dossier {app.referenceNumber} !
          </h2>
          <p className="text-xs text-emerald-700 max-w-md mx-auto leading-relaxed">
            {docSummary.isComplete
              ? 'Toutes les pièces requises sont désormais complètes. Votre dossier est transmis pour vérification.'
              : `${docSummary.providedRequiredCount} / ${docSummary.totalRequired} pièces sont fournies. Vous pouvez terminer les pièces restantes à tout moment.`}
          </p>
          <div className="pt-2">
            <Link
              to={`/candidat/dashboard?appId=${app.id}`}
              className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-colors shadow-xs"
            >
              <span>Retour à mon tableau de bord</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Notification detail banner */}
          <div className="bg-white rounded-3xl border border-rose-200 p-6 sm:p-8 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                  Dossier Réf : {app.referenceNumber}
                </span>
                <span className="text-xs text-slate-500">• {app.subjectTitle}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 px-3 py-1 rounded-full border border-rose-200 shrink-0">
                <Clock className="w-3.5 h-3.5" />
                <span>Date limite : {new Date(latestRequest.deadline).toLocaleDateString('fr-FR')}</span>
              </div>
            </div>

            <div className="p-4 bg-rose-50/60 rounded-2xl border border-rose-200 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-900 block">
                Observation administrative :
              </span>
              <p className="text-xs text-rose-900 leading-relaxed font-medium">
                « {latestRequest.comment} »
              </p>
            </div>
          </div>

          {/* Replacement uploads */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-900">
                Pièces à régulariser ou compléter ({docsToFix.length})
              </h2>
              <span className="text-xs font-semibold text-slate-500">
                {docSummary.providedRequiredCount} / {docSummary.totalRequired} pièces prêtes
              </span>
            </div>

            <div className="space-y-4">
              {docsToFix.map((doc) => (
                <div key={doc.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-slate-900">{doc.label}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          isCommonDocumentType(doc.type)
                            ? 'bg-teal-50 text-teal-800 border-teal-200'
                            : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                        }`}
                      >
                        {isCommonDocumentType(doc.type) ? 'Pièce commune' : 'Spécifique sujet'}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      {doc.status === 'rejete'
                        ? 'Rejeté'
                        : doc.status === 'complement_requis'
                        ? 'Complément requis'
                        : 'Pièce manquante'}
                    </span>
                  </div>

                  {doc.rejectionReason && (
                    <div className="text-xs text-rose-800 bg-rose-100/70 px-3 py-2 rounded-xl border border-rose-200">
                      <strong>Motif du rejet :</strong> {doc.rejectionReason}
                    </div>
                  )}

                  <DocumentUploader
                    document={doc}
                    onUpload={(docId, f) => handleDocumentUpload(docId, f)}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <Link
                to="/candidat/dashboard"
                className="text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Annuler et revenir
              </Link>

              <button
                type="button"
                onClick={handleResubmit}
                className="inline-flex items-center gap-2 bg-rose-700 hover:bg-rose-800 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-colors shadow-xs cursor-pointer"
              >
                <span>
                  {docSummary.isComplete
                    ? 'Transmettre mon dossier complété'
                    : 'Enregistrer les pièces ajoutées'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
