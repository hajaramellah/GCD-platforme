import React, { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Printer,
  ArrowLeft,
  FileText,
  ShieldCheck,
  Building2,
  UserCheck,
  Eye,
  Download,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { ApplicationDocument, CandidateApplication } from '../../types';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DocumentViewerModal } from '../../components/common/DocumentViewerModal';
import {
  downloadProtectedDocument,
  ViewableDocumentInput
} from '../../services/documentService';
import {
  isCommonDocumentType,
  summarizeApplicationDocuments
} from '../../utils/documentRequirements';

export const CandidateApplicationDetail: React.FC = () => {
  const { currentUser, currentRole, sessionToken } = useAuth();
  const [searchParams] = useSearchParams();
  const queryAppId = searchParams.get('appId');
  const [previewDoc, setPreviewDoc] = useState<ViewableDocumentInput | null>(null);

  const toAppViewableDoc = (
    app: CandidateApplication,
    doc: ApplicationDocument
  ): ViewableDocumentInput => ({
    id: doc.id,
    label: doc.label,
    fileName: doc.fileName,
    fileUrl:
      doc.fileUrl && doc.fileUrl !== '#'
        ? doc.fileUrl
        : doc.fileName
        ? `/api/applications/${app.id}/documents/${doc.id}/content`
        : '',
    fileSize: doc.fileSize,
    status: doc.status,
    provenance: doc.provenance,
    isDemoApogee: doc.isDemoApogee,
    rejectionReason: doc.rejectionReason,
    ownerId: app.candidateId,
    ownerEmail: app.candidateEmail,
    ownerCin: app.cin,
  });

  // Strict Candidate Application Isolation — returns ALL applications of currentUser
  const myApps = useMemo(
    () =>
      storageService.getCandidateApplicationsStrict(
        currentUser?.id,
        currentUser?.email,
        currentUser?.cin
      ),
    [currentUser?.id, currentUser?.email, currentUser?.cin]
  );

  const [selectedAppId, setSelectedAppId] = useState<string>(queryAppId || myApps[0]?.id || '');

  useEffect(() => {
    if (queryAppId && myApps.some((a) => a.id === queryAppId)) {
      setSelectedAppId(queryAppId);
    } else if (!myApps.some((a) => a.id === selectedAppId)) {
      setSelectedAppId(myApps[0]?.id || '');
    }
  }, [queryAppId, currentUser?.id, myApps]);

  const myApp = myApps.find((a) => a.id === selectedAppId) || myApps[0];
  const docSummary = useMemo(
    () => summarizeApplicationDocuments(myApp?.documents || []),
    [myApp]
  );

  if (!myApp) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Aucun dossier de candidature trouvé pour ce compte.</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Vous n&apos;avez pas encore finalisé de candidature doctorale. Consultez le catalogue des sujets pour postuler.
        </p>
        <Link
          to="/candidat/postuler"
          className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-colors shadow-xs"
        >
          <span>Déposer une candidature</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/candidat/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour à mon espace candidat</span>
        </Link>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs"
        >
          <Printer className="w-4 h-4" />
          <span>Imprimer mon accusé officiel</span>
        </button>
      </div>

      {myApps.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-600 px-2">Sélectionner un dossier :</span>
          {myApps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => setSelectedAppId(app.id)}
              className={`text-xs px-3 py-1.5 rounded-xl font-semibold border transition-colors ${
                myApp.id === app.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {app.referenceNumber} — {app.discipline}
            </button>
          ))}
        </div>
      )}

      {/* Main Official Receipt Sheet */}
      <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-sm space-y-8">
        {/* Header */}
        <div className="border-b-2 border-slate-900 pb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900">
              Accusé de Réception de Candidature Doctorale
            </h1>
            <p className="text-xs text-slate-500">
              Plateforme GCD • Université Sidi Mohamed Ben Abdellah (Démonstration académique)
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Numéro unique :</div>
            <div className="text-base font-mono font-black text-teal-800">
              {myApp.referenceNumber}
            </div>
          </div>
        </div>

        {/* Status banner */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="space-y-0.5">
            <span className="text-xs text-slate-600 font-medium block">Statut administratif de votre dossier :</span>
            <span className="text-[11px] text-slate-500">
              {docSummary.providedRequiredCount} / {docSummary.totalRequired} pièce(s) fournie(s) • {docSummary.validatedRequiredCount} validée(s)
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {docSummary.hasIssues && (
              <Link
                to={`/candidat/corrections?appId=${myApp.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-xl print:hidden"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Compléter / Régulariser</span>
              </Link>
            )}
            <StatusBadge status={myApp.status} size="lg" />
          </div>
        </div>

        {/* Information Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-700">
          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200">
            <span className="text-slate-400 font-semibold block">Identité Candidat</span>
            <span className="font-bold text-slate-900 text-sm">{myApp.candidateName}</span>
            <div className="text-slate-500 mt-1 font-mono">CIN : {myApp.cin} | CNE : {myApp.cne || '—'}</div>
            <div className="text-slate-500">{myApp.candidateEmail}</div>
          </div>

          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200">
            <span className="text-slate-400 font-semibold block">Cursus Validé</span>
            <span className="font-bold text-slate-900 text-sm">{myApp.masterSpecialty}</span>
            <div className="text-slate-500 mt-1">{myApp.masterOriginUniversity}</div>
            <div className="text-teal-700 font-semibold">Promotion {myApp.masterGraduationYear} — Mention {myApp.masterMention}</div>
          </div>

          <div className="sm:col-span-2 bg-slate-50/60 p-4 rounded-xl border border-slate-200">
            <span className="text-slate-400 font-semibold block">Sujet de Thèse Retenu</span>
            <span className="font-bold text-slate-900 text-sm">{myApp.subjectTitle}</span>
            <div className="text-slate-500 mt-1">Discipline : {myApp.discipline} • Labo : {myApp.laboratoryId.toUpperCase()}</div>
            <div className="text-slate-700 font-medium">Directeur de Thèse : {myApp.supervisorName}</div>
          </div>
        </div>

        {/* Documents */}
        <div className="space-y-3">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
            Pièces justificatives du dossier ({docSummary.providedRequiredCount} / {docSummary.totalRequired} fournies)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            {myApp.documents.map((d) => {
              const statusBadgeClass =
                d.status === 'valide'
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : d.status === 'rejete'
                  ? 'text-rose-700 bg-rose-50 border-rose-200'
                  : d.status === 'complement_requis' || d.status === 'manquant'
                  ? 'text-amber-700 bg-amber-50 border-amber-200'
                  : 'text-blue-700 bg-blue-50 border-blue-200';
              const statusLabel =
                d.status === 'valide'
                  ? 'Validé'
                  : d.status === 'rejete'
                  ? 'Rejeté'
                  : d.status === 'complement_requis'
                  ? 'Complément requis'
                  : d.status === 'manquant'
                  ? 'Manquant'
                  : 'En attente';

              return (
                <div
                  key={d.id}
                  className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span className="truncate text-slate-800 font-semibold">{d.label}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded border font-bold shrink-0 ${statusBadgeClass}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      {isCommonDocumentType(d.type) ? (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-semibold">
                          Commune
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold">
                          Spécifique
                        </span>
                      )}
                      {d.provenance === 'recupere_administration' ? (
                        <>
                          <Building2 className="w-3 h-3 text-teal-600" />
                          <span>Administration {d.isDemoApogee ? '(Démo APOGÉE)' : ''}</span>
                        </>
                      ) : d.status !== 'manquant' ? (
                        <>
                          <UserCheck className="w-3 h-3" />
                          <span>Fourni par le candidat</span>
                        </>
                      ) : (
                        <span>Non fournie</span>
                      )}
                    </span>
                    {(d.fileName || (d.fileUrl && d.fileUrl !== '#')) && (
                      <div className="inline-flex items-center gap-1.5 print:hidden">
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(toAppViewableDoc(myApp, d))}
                          className="inline-flex items-center gap-1 text-teal-800 hover:text-teal-950 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2 py-0.5 rounded font-semibold transition-colors whitespace-nowrap shrink-0"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Consulter</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadProtectedDocument(toAppViewableDoc(myApp, d), {
                              sessionToken,
                              currentUserId: currentUser?.id,
                              currentUserEmail: currentUser?.email,
                              currentUserCin: currentUser?.cin,
                              activeRole: currentRole,
                            }).catch(() => undefined)
                          }
                          className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-medium transition-colors whitespace-nowrap shrink-0"
                          title="Télécharger une copie (action secondaire)"
                          aria-label={`Télécharger ${d.fileName || d.label}`}
                        >
                          <Download className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  {d.rejectionReason && (
                    <div className="text-[11px] text-rose-700 font-medium">
                      Motif : {d.rejectionReason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Security watermark footer */}
        <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            <span>Document de démonstration — Centre d&apos;Études Doctorales USMBA</span>
          </div>
          <div>Généré le {new Date().toLocaleDateString('fr-FR')}</div>
        </div>
      </div>
      <DocumentViewerModal
        document={previewDoc}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  );
};
