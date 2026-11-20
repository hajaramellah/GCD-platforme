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

export const CandidateCorrectionWorkspace: React.FC = () => {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const queryAppId = searchParams.get('appId');

  // Strict Candidate Application Isolation — all applications belonging to candidate
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
          a.documents?.some(
            (d) => d.status === 'rejete' || d.status === 'complement_requis' || d.status === 'manquant'
          )
      ),
    [myApps]
  );

  const [selectedAppId, setSelectedAppId] = useState<string>(
    queryAppId || correctionApps[0]?.id || ''
  );

  const app = correctionApps.find((a) => a.id === selectedAppId) || correctionApps[0];

  const latestRequest: CorrectionRequest = app?.correctionRequests?.[0] || {
    id: 'req-active',
    applicationId: app?.id || '',
    requestedBy: 'Administration Scolarité CEDoc USMBA',
    requestedAt: app?.updatedAt || new Date().toISOString(),
    deadline: '2026-11-25T23:59:59Z',
    comment:
      'Des pièces justificatives ont été signalées comme non conformes ou nécessitant un complément par l\'administration.',
    missingOrInvalidDocs: [],
    isResolved: false
  };

  const [documents, setDocuments] = useState<ApplicationDocument[]>(app?.documents || []);
  const [isResubmitted, setIsResubmitted] = useState(false);

  useEffect(() => {
    setDocuments(app?.documents || []);
    setIsResubmitted(false);
  }, [app?.id]);

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
              rejectionReason: undefined,
              uploadedAt: new Date().toISOString()
            }
          : d
      )
    );
  };

  const docsToFix = documents.filter(
    (d) =>
      latestRequest.missingOrInvalidDocs.includes(d.type) ||
      d.status === 'rejete' ||
      d.status === 'complement_requis' ||
      d.status === 'manquant'
  );

  const handleResubmit = () => {
    if (!app) return;

    const updatedDocs = documents.map((d) =>
      d.status === 'rejete' || d.status === 'complement_requis' || d.status === 'manquant'
        ? { ...d, status: 'en_attente' as const }
        : d
    );

    const updatedApp = {
      ...app,
      status: 'corrigee' as const,
      documents: updatedDocs,
      statusHistory: [
        {
          id: `sh-${Date.now()}`,
          status: 'corrigee' as const,
          comment: 'Pièces rectifiées et complétées soumises par le candidat.',
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

    storageService.addNotification({
      targetRole: 'administration',
      title: `Régularisation effectuée — Réf ${app.referenceNumber}`,
      message: `Le candidat ${app.candidateName} a téléversé les pièces rectifiées demandées.`,
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
          Vos dossiers ne présentent aucune demande de correction active. Vous pouvez suivre l&apos;avancement dans votre espace candidat.
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
          Régularisation Officielle de Dossier
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Régularisation & Complément de Candidature
        </h1>
        <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
          Consultez les motifs formulés par le service d&apos;instruction administrative et remplacez les pièces demandées avant la date limite.
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
            Dossier régularisé et transmis à l&apos;administration !
          </h2>
          <p className="text-xs text-emerald-700 max-w-md mx-auto leading-relaxed">
            Vos pièces rectifiées ont été enregistrées avec succès. Le statut de votre candidature est passé à <strong>« Régularisé / Corrigé »</strong>.
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
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
                <Clock className="w-3.5 h-3.5" />
                <span>Date limite : {new Date(latestRequest.deadline).toLocaleDateString('fr-FR')}</span>
              </div>
            </div>

            <div className="p-4 bg-rose-50/60 rounded-2xl border border-rose-200 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-900 block">
                Motif communiqué par l&apos;Administration :
              </span>
              <p className="text-xs text-rose-900 leading-relaxed font-medium">
                « {latestRequest.comment} »
              </p>
            </div>
          </div>

          {/* Replacement uploads */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-900">
              Pièces à régulariser ({docsToFix.length})
            </h2>

            <div className="space-y-4">
              {docsToFix.map((doc) => (
                <div key={doc.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{doc.label}</span>
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      {doc.status === 'rejete'
                        ? 'Rejeté'
                        : doc.status === 'complement_requis'
                        ? 'Complément requis'
                        : 'À fournir / remplacer'}
                    </span>
                  </div>

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
                className="inline-flex items-center gap-2 bg-rose-700 hover:bg-rose-800 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-colors shadow-xs"
              >
                <span>Transmettre mon dossier rectifié</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
