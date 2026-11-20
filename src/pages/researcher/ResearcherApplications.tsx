import React, { useState, useEffect } from 'react';
import {
  Users,
  Eye,
  Layers,
  X,
  Download,
  AlertTriangle,
  CheckCircle2
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
import { summarizeApplicationDocuments } from '../../utils/documentRequirements';

export const ResearcherApplications: React.FC = () => {
  const { currentUser, currentRole, sessionToken } = useAuth();
  const [applications, setApplications] = useState<CandidateApplication[]>(() =>
    storageService.getApplications()
  );
  const subjects = storageService.getSubjects();

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [comparingApps, setComparingApps] = useState<CandidateApplication[]>([]);
  const [inspectApp, setInspectApp] = useState<CandidateApplication | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ViewableDocumentInput | null>(null);

  useEffect(() => {
    let cancelled = false;
    const syncFromBackend = async () => {
      try {
        const res = await fetch('/api/applications', {
          headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : undefined,
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.success || !Array.isArray(data.applications)) return;

        const localApps = storageService.getApplications();
        const localMap = new Map(localApps.map((a) => [a.id, a]));
        const allSubjects = storageService.getSubjects();
        const users = storageService.getUsers();
        let hasUpdates = false;

        for (const srvApp of data.applications as Partial<CandidateApplication>[]) {
          if (!srvApp.id) continue;
          const local = localMap.get(srvApp.id);
          const subject = allSubjects.find((s) => s.id === (srvApp.subjectId || local?.subjectId));
          const candidate = users.find((u) => u.id === (srvApp.candidateId || local?.candidateId));

          if (!local) {
            const hydrated: CandidateApplication = {
              referenceNumber: srvApp.referenceNumber || `USMBA-DOC-${srvApp.id}`,
              candidateId: srvApp.candidateId || candidate?.id || '',
              candidateName:
                srvApp.candidateName ||
                (candidate ? `${candidate.firstName} ${candidate.lastName}` : srvApp.candidateEmail || 'Candidat'),
              candidateEmail: srvApp.candidateEmail || candidate?.email || '',
              candidatePhone: srvApp.candidatePhone || candidate?.phone || '',
              cin: srvApp.cin || candidate?.cin || '',
              cne: srvApp.cne || candidate?.cne || '',
              studentOriginType: srvApp.studentOriginType || candidate?.studentOriginType || 'interne_usmba',
              masterOriginUniversity: srvApp.masterOriginUniversity || candidate?.originEstablishment || 'USMBA Fès',
              masterSpecialty: srvApp.masterSpecialty || candidate?.masterSpecialty || 'Master',
              masterGraduationYear: Number(srvApp.masterGraduationYear) || 2026,
              masterMention: srvApp.masterMention || 'Bien',
              subjectId: srvApp.subjectId || '',
              subjectTitle: srvApp.subjectTitle || subject?.title || 'Sujet doctoral',
              laboratoryId: srvApp.laboratoryId || subject?.laboratoryId || 'lisac',
              establishmentId: srvApp.establishmentId || subject?.establishmentId || 'fsdm',
              discipline: srvApp.discipline || subject?.discipline || 'Informatique',
              supervisorName: srvApp.supervisorName || subject?.supervisorName || 'À désigner',
              status: (srvApp.status as CandidateApplication['status']) || 'soumise',
              documents: Array.isArray(srvApp.documents) ? srvApp.documents : [],
              correctionRequests: Array.isArray(srvApp.correctionRequests) ? srvApp.correctionRequests : [],
              statusHistory: Array.isArray(srvApp.statusHistory) ? srvApp.statusHistory : [],
              submittedAt: srvApp.submittedAt || new Date().toISOString(),
              updatedAt: srvApp.updatedAt || new Date().toISOString(),
              ...srvApp,
              id: srvApp.id,
            };
            storageService.saveApplication(hydrated, {
              id: currentUser?.id || 'chercheur',
              name: `${currentUser?.firstName || 'Chercheur'} ${currentUser?.lastName || ''}`.trim(),
              role: currentRole || 'enseignant_chercheur',
            });
            hasUpdates = true;
          } else if (
            srvApp.updatedAt &&
            (!local.updatedAt || new Date(srvApp.updatedAt).getTime() > new Date(local.updatedAt).getTime())
          ) {
            const merged: CandidateApplication = {
              ...local,
              ...srvApp,
              candidateName: srvApp.candidateName || local.candidateName,
              subjectTitle: srvApp.subjectTitle || local.subjectTitle,
              masterSpecialty: srvApp.masterSpecialty || local.masterSpecialty,
              masterOriginUniversity: srvApp.masterOriginUniversity || local.masterOriginUniversity,
              masterMention: srvApp.masterMention || local.masterMention,
              documents: Array.isArray(srvApp.documents) && srvApp.documents.length > 0 ? srvApp.documents : local.documents,
            };
            storageService.saveApplication(merged, {
              id: currentUser?.id || 'chercheur',
              name: `${currentUser?.firstName || 'Chercheur'} ${currentUser?.lastName || ''}`.trim(),
              role: currentRole || 'enseignant_chercheur',
            });
            hasUpdates = true;
          }
        }

        if (!cancelled && hasUpdates) {
          setApplications(storageService.getApplications());
        }
      } catch {
        // Non-blocking fallback
      }
    };
    syncFromBackend();
    return () => {
      cancelled = true;
    };
  }, [sessionToken, currentUser?.id, currentRole]);

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

  const filteredApps = applications.filter((app) => {
    return selectedSubjectId === 'all' || app.subjectId === selectedSubjectId;
  });

  const toggleCompare = (app: CandidateApplication) => {
    if (comparingApps.some((a) => a.id === app.id)) {
      setComparingApps((prev) => prev.filter((a) => a.id !== app.id));
    } else {
      if (comparingApps.length >= 2) {
        setComparingApps([comparingApps[1], app]);
      } else {
        setComparingApps((prev) => [...prev, app]);
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 rounded-3xl p-8 text-white shadow-xl space-y-3">
        <div className="inline-flex items-center gap-2 bg-teal-500/20 border border-teal-400/40 px-3 py-1 rounded-full text-teal-300 text-xs font-semibold">
          <Users className="w-3.5 h-3.5" />
          Consultation & Examen Comparatif des Candidatures
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Examen Comparatif des Candidatures
        </h1>
        <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
          Consultez et comparez les dossiers académiques (mentions, spécialités Master, avant-projets de thèse) des postulants selon des critères d'évaluation normalisés.
        </p>
      </div>

      {/* Comparison Drawer if 2 apps selected */}
      {comparingApps.length > 0 && (
        <div className="p-6 bg-slate-900 text-white rounded-3xl space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-teal-300">
              <Layers className="w-4 h-4" />
              <span>Tableau Comparatif Normalisé ({comparingApps.length} candidat(s) sélectionné(s))</span>
            </div>
            <button
              onClick={() => setComparingApps([])}
              className="text-xs text-slate-400 hover:text-white"
            >
              Fermer la comparaison
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {comparingApps.map((ca) => (
              <div key={ca.id} className="bg-white/10 p-5 rounded-2xl border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-teal-300">{ca.candidateName}</span>
                  <span className="font-mono text-[10px] text-slate-400">{ca.referenceNumber}</span>
                </div>
                <div className="space-y-1">
                  <div className="text-slate-300 font-semibold">Diplôme Master :</div>
                  <div>{ca.masterSpecialty} ({ca.masterOriginUniversity})</div>
                  <div className="text-emerald-400 font-bold">Mention : {ca.masterMention} (Promotion {ca.masterGraduationYear})</div>
                </div>
                <div className="space-y-1 pt-2 border-t border-white/10">
                  <div className="text-slate-300 font-semibold">Sujet visé :</div>
                  <div className="line-clamp-2 text-slate-200">{ca.subjectTitle}</div>
                </div>
                <div className="pt-2">
                  <button
                    onClick={() => setInspectApp(ca)}
                    className="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold py-2 rounded-xl text-xs transition-colors"
                  >
                    Voir le dossier complet
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Applications list */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-base text-slate-900">
              Candidatures Reçues ({filteredApps.length})
            </h3>
            <p className="text-xs text-slate-500">
              Cochez deux candidats pour afficher la comparaison côte à côte
            </p>
          </div>

          <div className="w-full sm:w-72">
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">Tous mes sujets</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title.substring(0, 45)}...
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {filteredApps.map((app) => {
            const isCompared = comparingApps.some((c) => c.id === app.id);
            const docSummary = summarizeApplicationDocuments(app.documents);
            return (
              <div
                key={app.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isCompared
                    ? 'border-teal-400 bg-teal-50/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="space-y-1.5 max-w-xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{app.candidateName}</span>
                    <span className="font-mono text-xs text-slate-400">({app.referenceNumber})</span>
                    <StatusBadge status={app.status} size="sm" />
                    {docSummary.hasIssues ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                        <AlertTriangle className="w-3 h-3" />
                        {docSummary.providedRequiredCount}/{docSummary.totalRequired} pièces
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        {docSummary.providedRequiredCount}/{docSummary.totalRequired} pièces
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600">
                    <strong>Master :</strong> {app.masterSpecialty} • Mention <span className="font-bold text-teal-800">{app.masterMention}</span> ({app.masterGraduationYear})
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    <strong>Sujet :</strong> {app.subjectTitle}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleCompare(app)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                      isCompared
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {isCompared ? 'Sélectionné' : 'Comparer'}
                  </button>

                  <button
                    onClick={() => setInspectApp(app)}
                    className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Dossier</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Modal */}
      {inspectApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-teal-300">{inspectApp.referenceNumber}</span>
                <h3 className="font-extrabold text-base">{inspectApp.candidateName}</h3>
              </div>
              <button
                onClick={() => setInspectApp(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border">
                <div>
                  <span className="text-slate-400 block font-semibold">Identifiants</span>
                  <span className="font-bold text-slate-900">CIN: {inspectApp.cin} | CNE: {inspectApp.cne}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Statut instruction</span>
                  <StatusBadge status={inspectApp.status} size="sm" />
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block font-semibold">Cursus Master</span>
                  <span className="font-bold text-slate-900">{inspectApp.masterSpecialty}</span>
                  <div className="text-slate-500">{inspectApp.masterOriginUniversity} — Mention {inspectApp.masterMention}</div>
                </div>
              </div>

              {(() => {
                const modalSummary = summarizeApplicationDocuments(inspectApp.documents);
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-900">
                        Pièces justificatives ({modalSummary.providedRequiredCount}/{modalSummary.totalRequired} fournies)
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        {modalSummary.validatedRequiredCount} validée(s)
                      </span>
                    </div>
                    <div className="space-y-2">
                      {inspectApp.documents.map((d) => {
                        const badgeClass =
                          d.status === 'valide'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : d.status === 'rejete' || d.status === 'manquant'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : d.status === 'complement_requis'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200';
                        const badgeLabel =
                          d.status === 'valide'
                            ? 'Validée'
                            : d.status === 'rejete'
                            ? 'Rejetée'
                            : d.status === 'manquant'
                            ? 'Manquante'
                            : d.status === 'complement_requis'
                            ? 'Complément requis'
                            : 'En attente';

                        return (
                          <div
                            key={d.id}
                            className="p-2.5 bg-slate-50 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-slate-800">{d.label}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeClass}`}>
                                  {badgeLabel}
                                </span>
                              </div>
                              <span className="text-[11px] font-mono text-slate-500 block">
                                {d.fileName || 'Non fourni'}
                              </span>
                            </div>
                            {(d.fileName || (d.fileUrl && d.fileUrl !== '#')) && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setPreviewDoc(toAppViewableDoc(inspectApp, d))}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 hover:text-teal-950 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Consulter</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadProtectedDocument(toAppViewableDoc(inspectApp, d), {
                                      sessionToken,
                                      currentUserId: currentUser?.id,
                                      currentUserEmail: currentUser?.email,
                                      currentUserCin: currentUser?.cin,
                                      activeRole: currentRole,
                                    }).catch(() => undefined)
                                  }
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0"
                                  title="Télécharger une copie (action secondaire)"
                                >
                                  <Download className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="p-4 bg-slate-50 border-t flex justify-end">
              <button
                onClick={() => setInspectApp(null)}
                className="bg-slate-900 text-white px-5 py-2 rounded-xl font-bold text-xs"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
      <DocumentViewerModal
        document={previewDoc}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  );
};
