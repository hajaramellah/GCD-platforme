import React, { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FileText,
  AlertTriangle,
  Calendar,
  Award,
  CheckCircle2,
  ArrowRight,
  Send,
  BookOpen,
  PlusCircle,
  Building2,
  UserCheck,
  Eye,
  Download,
  FolderCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { ApplicationDocument, CandidateApplication } from '../../types';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DoctoralPathTimeline } from '../../components/candidate/DoctoralPathTimeline';
import { DocumentViewerModal } from '../../components/common/DocumentViewerModal';
import { DocumentUploader } from '../../components/common/DocumentUploader';
import {
  downloadProtectedDocument,
  ViewableDocumentInput,
} from '../../services/documentService';
import {
  COMMON_DOCUMENT_SPECS,
  summarizeApplicationDocuments,
} from '../../utils/documentRequirements';

export const CandidateDashboard: React.FC = () => {
  const { currentUser, currentRole, sessionToken, refreshUserData } = useAuth();
  const [searchParams] = useSearchParams();
  const queryAppId = searchParams.get('appId');
  const [previewDoc, setPreviewDoc] = useState<ViewableDocumentInput | null>(null);
  const [vaultSyncNotice, setVaultSyncNotice] = useState<string | null>(null);
  const [versionTick, setVersionTick] = useState(0);

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

  // Strict Candidate Application Isolation — returns ALL applications belonging to currentUser
  const myApps = useMemo(
    () =>
      storageService.getCandidateApplicationsStrict(
        currentUser?.id,
        currentUser?.email,
        currentUser?.cin
      ),
    [currentUser?.id, currentUser?.email, currentUser?.cin, versionTick]
  );

  const [selectedAppId, setSelectedAppId] = useState<string>(
    queryAppId || myApps[0]?.id || ''
  );

  useEffect(() => {
    if (queryAppId && myApps.some((a) => a.id === queryAppId)) {
      setSelectedAppId(queryAppId);
    } else if (!myApps.some((a) => a.id === selectedAppId)) {
      setSelectedAppId(myApps[0]?.id || '');
    }
  }, [queryAppId, currentUser?.id, myApps]);

  const myApp = myApps.find((a) => a.id === selectedAppId) || myApps[0];
  const myAppSummary = useMemo(
    () => summarizeApplicationDocuments(myApp?.documents || []),
    [myApp]
  );

  // Centralized personal document vault view for the candidate
  const vaultDocsList = useMemo(() => {
    const sharedMap = storageService.getSharedCandidateDocuments(
      currentUser?.id,
      currentUser?.email,
      currentUser?.cin
    );
    return COMMON_DOCUMENT_SPECS.map((spec, idx) => {
      const existing = sharedMap[spec.type] as ApplicationDocument | undefined;
      if (existing) {
        return {
          ...existing,
          id: existing.id || `vault-${currentUser?.id || 'c'}-${spec.type}-${idx}`,
          label: spec.label,
          isRequired: spec.isRequired,
        } as ApplicationDocument;
      }
      return {
        id: `vault-${currentUser?.id || 'c'}-${spec.type}-${idx}`,
        type: spec.type,
        label: spec.label,
        fileName: '',
        fileSize: 0,
        fileUrl: '',
        isRequired: spec.isRequired,
        status: 'manquant' as const,
        provenance: 'fourni_candidat' as const,
        uploadedAt: '',
      };
    });
  }, [currentUser?.id, currentUser?.email, currentUser?.cin, currentUser?.sharedDocuments, versionTick]);

  const handleVaultDocumentUpload = async (
    docId: string,
    file: { fileName: string; fileSize: number; fileUrl: string }
  ) => {
    if (!currentUser) return;
    const targetSpec = vaultDocsList.find((d) => d.id === docId);
    if (!targetSpec) return;

    const newVaultDoc: ApplicationDocument = {
      ...targetSpec,
      fileName: file.fileName,
      fileSize: file.fileSize,
      fileUrl: file.fileUrl,
      status: 'en_attente',
      provenance: 'fourni_candidat',
      isDemoApogee: false,
      rejectionReason: undefined,
      uploadedAt: new Date().toISOString(),
    };

    const syncedApps = storageService.saveCandidateSharedDocument(currentUser.id, newVaultDoc, {
      syncPendingApps: true,
      actor: {
        id: currentUser.id,
        name: `${currentUser.firstName} ${currentUser.lastName}`,
        role: 'candidat',
      },
    });

    // Push any updated apps to backend memory store
    for (const updatedApp of syncedApps) {
      try {
        await fetch(`/api/applications/${updatedApp.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify(updatedApp),
        });
      } catch {
        // Non-blocking fallback
      }
    }

    refreshUserData();
    setVersionTick((t) => t + 1);
    setVaultSyncNotice(
      syncedApps.length > 0
        ? `Pièce « ${targetSpec.label} » enregistrée dans votre dossier personnel et synchronisée sur ${syncedApps.length} candidature(s) en cours.`
        : `Pièce « ${targetSpec.label} » enregistrée dans votre dossier personnel.`
    );
    setTimeout(() => setVaultSyncNotice(null), 6000);
  };

  const interviewSlots = storageService.getInterviews();
  const myInterview = myApp ? interviewSlots.find((s) => s.applicationId === myApp.id) : null;

  const hasActionRequired = Boolean(
    myApp &&
      (myApp.status === 'correction_demandee' ||
        myApp.status === 'incomplete' ||
        myAppSummary.hasIssues)
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 rounded-3xl p-8 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 text-teal-300 bg-teal-500/20 border border-teal-400/40 px-3 py-1 rounded-full text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              Espace Candidat USMBA • {myApps.length} candidature(s) •{' '}
              {currentUser?.studentOriginType === 'externe' ? 'Externe' : 'Interne USMBA'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Bienvenue, {currentUser?.firstName} {currentUser?.lastName}
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm">
            CIN : <span className="font-mono text-teal-300">{currentUser?.cin || '—'}</span> • Compte :{' '}
            <span className="font-mono text-slate-200">{currentUser?.email}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/sujets"
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors backdrop-blur-xs flex items-center gap-2"
          >
            <BookOpen className="w-4 h-4 text-teal-300" />
            <span>Catalogue des Sujets</span>
          </Link>
          <Link
            to="/candidat/postuler"
            className="bg-teal-500 hover:bg-teal-400 text-slate-950 px-5 py-2.5 rounded-xl font-bold text-xs transition-colors shadow-xs flex items-center gap-2"
          >
            {myApps.length > 0 ? (
              <PlusCircle className="w-4 h-4 text-slate-950" />
            ) : (
              <Send className="w-4 h-4 text-slate-950" />
            )}
            <span>{myApps.length > 0 ? 'Postuler à un autre sujet' : 'Déposer une candidature'}</span>
          </Link>
        </div>
      </div>

      {/* Multi-application list / selector */}
      {myApps.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">
                Mes candidatures ({myApps.length})
              </h2>
              <p className="text-xs text-slate-500">
                Chaque dossier possède son propre suivi, son statut et ses pièces dédiées.
              </p>
            </div>
            <Link
              to="/sujets"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-900"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Ajouter une candidature sur un autre sujet</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {myApps.map((app) => {
              const isSelected = myApp?.id === app.id;
              const sum = summarizeApplicationDocuments(app.documents);
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => setSelectedAppId(app.id)}
                  className={`text-left p-4 rounded-2xl border transition-all space-y-2 cursor-pointer ${
                    isSelected
                      ? 'border-teal-500 bg-teal-50/50 ring-2 ring-teal-500/20'
                      : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-bold text-teal-800">
                      {app.referenceNumber}
                    </span>
                    <StatusBadge status={app.status} size="sm" />
                  </div>
                  <div className="text-xs font-bold text-slate-900 line-clamp-2">
                    {app.subjectTitle}
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center justify-between gap-2">
                    <span>{sum.providedRequiredCount}/{sum.totalRequired} pièces fournies</span>
                    <span>{new Date(app.submittedAt).toLocaleDateString('fr-FR')}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Centralized Personal Vault Section */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <FolderCheck className="w-5 h-5 text-teal-700" />
              <span>Mon dossier personnel (Pièces communes centralisées)</span>
            </h2>
            <p className="text-xs text-slate-500">
              Complétez ou mettez à jour vos pièces communes ici : elles sont réutilisées automatiquement pour toutes vos candidatures et synchronisées sur vos dossiers incomplets.
            </p>
          </div>
          <div className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full shrink-0 self-start sm:self-center">
            {vaultDocsList.filter((d) => Boolean(d.fileName)).length} / {vaultDocsList.length} prêtes
          </div>
        </div>

        {vaultSyncNotice && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{vaultSyncNotice}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {vaultDocsList.map((doc) => (
            <DocumentUploader
              key={doc.id}
              document={doc}
              onUpload={handleVaultDocumentUpload}
            />
          ))}
        </div>
      </div>

      {/* Primary Feature: Mon parcours doctoral */}
      <DoctoralPathTimeline application={myApp} candidateName={currentUser?.firstName} />

      {/* Urgent Action / Incomplete / Correction Card */}
      {hasActionRequired && myApp && (
        <div className="p-6 bg-rose-50 border-2 border-rose-300 rounded-3xl space-y-4 shadow-xs">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-rose-900">
                  {myApp.status === 'incomplete'
                    ? `Dossier incomplet : ${myApp.referenceNumber}`
                    : `Régularisation requise : ${myApp.referenceNumber}`}
                </h3>
                <span className="text-[10px] font-bold bg-rose-200 text-rose-800 px-2 py-0.5 rounded-full">
                  {myAppSummary.missingDocs.length} manquante(s) • {myAppSummary.rejectedDocs.length + myAppSummary.complementDocs.length} rejetée(s)
                </span>
              </div>
              <p className="text-xs text-rose-800 leading-relaxed">
                {myApp.correctionRequests?.[0]?.comment ||
                  'Certaines pièces de ce dossier sont manquantes ou nécessitent une rectification avant validation.'}
              </p>
              {(myAppSummary.rejectedDocs.length > 0 || myAppSummary.missingDocs.length > 0) && (
                <ul className="text-xs text-rose-900 list-disc pl-5 space-y-0.5 pt-1">
                  {myAppSummary.rejectedDocs.map((d) => (
                    <li key={d.id}>
                      <strong>{d.label} (Rejetée)</strong>
                      {d.rejectionReason ? ` : ${d.rejectionReason}` : ''}
                    </li>
                  ))}
                  {myAppSummary.complementDocs.map((d) => (
                    <li key={d.id}>
                      <strong>{d.label} (Complément requis)</strong>
                      {d.rejectionReason ? ` : ${d.rejectionReason}` : ''}
                    </li>
                  ))}
                  {myAppSummary.missingDocs.map((d) => (
                    <li key={d.id}>
                      <strong>{d.label}</strong> — Pièce manquante
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Link
              to={`/candidat/corrections?appId=${myApp.id}`}
              className="inline-flex items-center gap-2 bg-rose-700 hover:bg-rose-800 text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-colors shadow-xs"
            >
              <span>Compléter / Corriger ce dossier</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Interview scheduled alert */}
      {myApp?.status === 'entretien_programme' && (
        <div className="p-6 bg-teal-50 border border-teal-300 rounded-3xl space-y-4 shadow-xs">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6" />
            </div>
            <div className="space-y-1 flex-1">
              <h3 className="font-bold text-sm sm:text-base text-teal-950">
                Convocation à l&apos;audition orale du jury
              </h3>
              <p className="text-xs text-teal-800 leading-relaxed">
                Votre dossier ({myApp.referenceNumber}) a été déclaré <strong>Recevable</strong>. Votre audition est programmée
                {myInterview ? ` pour le ${myInterview.date} à ${myInterview.startTime} (${myInterview.roomOrLink})` : '.'}
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Link
              to={`/candidat/convocation?appId=${myApp.id}`}
              className="inline-flex items-center gap-2 bg-teal-800 hover:bg-teal-900 text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-colors shadow-xs"
            >
              <span>Voir ma convocation</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Admitted celebration card */}
      {myApp?.status === 'admise' && (
        <div className="p-6 bg-emerald-50 border-2 border-emerald-300 rounded-3xl space-y-4 shadow-xs">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <Award className="w-6 h-6" />
            </div>
            <div className="space-y-1 flex-1">
              <h3 className="font-bold text-sm sm:text-base text-emerald-950">
                Félicitations ! Vous êtes admis(e) au cycle doctoral (Liste Principale)
              </h3>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Le jury a validé votre admission sur le dossier {myApp.referenceNumber} avec la note de{' '}
                <strong>{myApp.score ? `${myApp.score}/20` : 'Très Honorable'}</strong>.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Link
              to={`/candidat/inscription-administrative?appId=${myApp.id}`}
              className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-colors shadow-xs"
            >
              <span>Préparer mon inscription définitive</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Active Application Card */}
      {myApp ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-md">
                  Réf : {myApp.referenceNumber}
                </span>
                <StatusBadge status={myApp.status} />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-2">
                {myApp.subjectTitle}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to={`/candidat/mon-dossier?appId=${myApp.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Accusé de réception</span>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-slate-400 font-semibold block">Discipline</span>
              <span className="font-bold text-slate-800">{myApp.discipline}</span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-slate-400 font-semibold block">Directeur de Thèse</span>
              <span className="font-bold text-slate-800">{myApp.supervisorName}</span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-slate-400 font-semibold block">Date de Soumission</span>
              <span className="font-bold text-slate-800">
                {new Date(myApp.submittedAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>

          {/* Documents summary */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-slate-900">
                Pièces du dossier ({myAppSummary.providedRequiredCount} / {myAppSummary.totalRequired} fournies)
              </span>
              <span className="text-slate-500">
                {myAppSummary.validatedRequiredCount} validée(s) •{' '}
                {myAppSummary.pendingRequiredCount} en attente •{' '}
                {myAppSummary.missingDocs.length} manquante(s) •{' '}
                {myAppSummary.rejectedDocs.length + myAppSummary.complementDocs.length} à corriger
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
              {myApp.documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`p-3 rounded-xl border space-y-2 flex flex-col justify-between ${
                    doc.status === 'valide'
                      ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                      : doc.status === 'rejete'
                      ? 'bg-rose-50 border-rose-200 text-rose-900 font-semibold'
                      : doc.status === 'complement_requis' || doc.status === 'manquant'
                      ? 'bg-amber-50 border-amber-200 text-amber-900 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{doc.label}</span>
                      {doc.status === 'valide' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                      {doc.status === 'rejete' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                      {(doc.status === 'manquant' || doc.status === 'complement_requis') && (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                    </div>
                    <div className="text-[10px] opacity-80 flex items-center gap-1">
                      {doc.status === 'manquant' ? (
                        <span>Pièce manquante</span>
                      ) : doc.provenance === 'recupere_administration' ? (
                        <>
                          <Building2 className="w-3 h-3" />
                          <span>Administration {doc.isDemoApogee ? '(Démo APOGÉE)' : ''}</span>
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-3 h-3" />
                          <span>Fourni par le candidat</span>
                        </>
                      )}
                    </div>
                    {doc.rejectionReason && (
                      <div className="text-[10px] text-rose-800 bg-rose-100/80 px-2 py-1 rounded">
                        Motif : {doc.rejectionReason}
                      </div>
                    )}
                  </div>

                  {(doc.fileName || (doc.fileUrl && doc.fileUrl !== '#')) && (
                    <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200/60">
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(toAppViewableDoc(myApp, doc))}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 hover:text-teal-950 bg-white hover:bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Consulter</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadProtectedDocument(toAppViewableDoc(myApp, doc), {
                            sessionToken,
                            currentUserId: currentUser?.id,
                            currentUserEmail: currentUser?.email,
                            currentUserCin: currentUser?.cin,
                            activeRole: currentRole,
                          }).catch(() => undefined)
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        title="Télécharger une copie"
                        aria-label={`Télécharger ${doc.fileName || doc.label}`}
                      >
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-4">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="font-bold text-base text-slate-900">Aucune candidature déposée pour le moment</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Consultez le catalogue des sujets de recherche pour sélectionner un ou plusieurs sujets.
          </p>
          <Link
            to="/sujets"
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-3 rounded-xl text-xs transition-colors shadow-xs"
          >
            <span>Choisir des sujets de thèse</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      <DocumentViewerModal
        document={previewDoc}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  );
};
