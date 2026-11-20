import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  Eye,
  X,
  Clock,
  Building2,
  UserCheck,
  Download
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import {
  CandidateApplication,
  ApplicationDocument,
  DocumentType
} from '../../types';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DocumentViewerModal } from '../../components/common/DocumentViewerModal';
import {
  downloadProtectedDocument,
  ViewableDocumentInput
} from '../../services/documentService';
import { summarizeApplicationDocuments } from '../../utils/documentRequirements';

export const AdminApplicationsQueue: React.FC = () => {
  const { currentUser, currentRole, sessionToken } = useAuth();
  const [applications, setApplications] = useState<CandidateApplication[]>(() =>
    storageService.getApplications()
  );

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedApp, setSelectedApp] = useState<CandidateApplication | null>(null);
  const [previewDocContext, setPreviewDocContext] = useState<{
    appId: string;
    docId: string;
  } | null>(null);

  // Per-document inline reason editing state
  const [editingReasonDocId, setEditingReasonDocId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState<string>('');
  const [pendingDocStatus, setPendingDocStatus] = useState<'rejete' | 'complement_requis'>('rejete');

  // Correction request modal & validation error state
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionComment, setCorrectionComment] = useState('');
  const [correctionDeadline, setCorrectionDeadline] = useState('2026-11-20');
  const [selectedDeficientDocs, setSelectedDeficientDocs] = useState<DocumentType[]>([]);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);

  const reloadApplications = () => {
    setApplications(storageService.getApplications());
  };

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
        const subjects = storageService.getSubjects();
        const users = storageService.getUsers();
        let hasUpdates = false;

        for (const srvApp of data.applications as Partial<CandidateApplication>[]) {
          if (!srvApp.id) continue;
          const local = localMap.get(srvApp.id);
          const subject = subjects.find((s) => s.id === (srvApp.subjectId || local?.subjectId));
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
              id: currentUser?.id || 'admin',
              name: `${currentUser?.firstName || 'Admin'} ${currentUser?.lastName || ''}`.trim(),
              role: 'administration',
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
              statusHistory:
                Array.isArray(srvApp.statusHistory) && srvApp.statusHistory.length > 0
                  ? srvApp.statusHistory
                  : local.statusHistory,
              correctionRequests:
                Array.isArray(srvApp.correctionRequests) && srvApp.correctionRequests.length > 0
                  ? srvApp.correctionRequests
                  : local.correctionRequests,
            };
            storageService.saveApplication(merged, {
              id: currentUser?.id || 'admin',
              name: `${currentUser?.firstName || 'Admin'} ${currentUser?.lastName || ''}`.trim(),
              role: 'administration',
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
  }, [sessionToken, currentUser?.id]);

  const toViewableAppDoc = (
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
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      app.candidateName.toLowerCase().includes(q) ||
      app.referenceNumber.toLowerCase().includes(q) ||
      app.cin.toLowerCase().includes(q) ||
      app.discipline.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  // Per-document status update (valide / rejete / complement_requis / en_attente)
  const handleDocumentStatusChange = async (
    app: CandidateApplication,
    docId: string,
    newStatus: ApplicationDocument['status'],
    reason?: string
  ) => {
    const updatedDocs = app.documents.map((d) =>
      d.id === docId
        ? {
            ...d,
            status: newStatus,
            rejectionReason:
              newStatus === 'rejete' || newStatus === 'complement_requis'
                ? reason || d.rejectionReason || 'Pièce non conforme ou illisible.'
                : undefined
          }
        : d
    );

    const updatedApp: CandidateApplication = {
      ...app,
      documents: updatedDocs,
      status:
        newStatus === 'rejete' || newStatus === 'complement_requis'
          ? 'correction_demandee'
          : app.status,
      assignedReviewerId: currentUser?.id,
      assignedReviewerName: `${currentUser?.firstName} ${currentUser?.lastName}`,
      updatedAt: new Date().toISOString()
    };

    storageService.saveApplication(updatedApp, {
      id: currentUser?.id || 'admin',
      name: `${currentUser?.firstName} ${currentUser?.lastName}`,
      role: 'administration'
    });

    // Sync to backend when application exists on backend
    try {
      await fetch(`/api/applications/${app.id}/documents/${docId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          status: newStatus,
          rejectionReason:
            newStatus === 'rejete' || newStatus === 'complement_requis'
              ? reason || 'Pièce non conforme ou illisible.'
              : undefined
        })
      });
    } catch {
      // Non-blocking fallback
    }

    if (newStatus === 'rejete' || newStatus === 'complement_requis') {
      const targetDoc = app.documents.find((d) => d.id === docId);
      storageService.addNotification({
        targetRole: 'candidat',
        userId: app.candidateId,
        title: `Action requise sur votre pièce — ${app.referenceNumber}`,
        message: `La pièce "${targetDoc?.label || 'Document'}" a été marquée "${
          newStatus === 'rejete' ? 'Rejetée' : 'Complément requis'
        }". Motif : ${reason || 'Merci de la vérifier et la remplacer.'}`,
        category: 'candidature',
        link: `/candidat/corrections?appId=${app.id}`
      });
    }

    setAdminActionError(null);
    setSelectedApp(updatedApp);
    reloadApplications();
    setEditingReasonDocId(null);
    setReasonDraft('');
  };

  // Action: Validate dossier as "Recevable"
  const handleValidateRecevable = async (app: CandidateApplication) => {
    const docSummary = summarizeApplicationDocuments(app.documents);
    if (docSummary.hasIssues) {
      setAdminActionError(
        `Validation bloquée : ${docSummary.missingDocs.length} pièce(s) manquante(s), ${docSummary.rejectedDocs.length} rejetée(s) et ${docSummary.complementDocs.length} en complément requis. Veuillez régulariser toutes les pièces avant de déclarer le dossier recevable.`
      );
      return;
    }
    setAdminActionError(null);

    const updated: CandidateApplication = {
      ...app,
      status: 'recevable',
      assignedReviewerId: currentUser?.id,
      assignedReviewerName: `${currentUser?.firstName} ${currentUser?.lastName}`,
      statusHistory: [
        {
          id: `sh-${Date.now()}`,
          status: 'recevable',
          comment: 'Conformité des pièces justificatives validée. Dossier déclaré recevable pour audition.',
          changedBy: `${currentUser?.firstName} ${currentUser?.lastName}`,
          timestamp: new Date().toISOString()
        },
        ...app.statusHistory
      ],
      updatedAt: new Date().toISOString()
    };

    storageService.saveApplication(updated, {
      id: currentUser?.id || 'admin',
      name: `${currentUser?.firstName} ${currentUser?.lastName}`,
      role: 'administration'
    });

    try {
      await fetch(`/api/applications/${app.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(updated),
      });
    } catch {
      // Non-blocking fallback
    }

    storageService.addNotification({
      targetRole: 'candidat',
      userId: app.candidateId,
      title: `Candidature Recevable — ${app.referenceNumber}`,
      message: "Félicitations, l'instruction administrative de vos pièces est validée. Votre dossier est transmis à la commission de sélection.",
      category: 'candidature',
      link: `/candidat/dashboard?appId=${app.id}`
    });

    setSelectedApp(updated);
    reloadApplications();
  };

  // Action: Send correction notice
  const handleSendCorrectionNotice = async () => {
    if (!selectedApp) return;

    const newCorrection = {
      id: `corr-${Date.now()}`,
      applicationId: selectedApp.id,
      requestedBy: `${currentUser?.firstName} ${currentUser?.lastName} (Administration Scolarité)`,
      requestedAt: new Date().toISOString(),
      deadline: `${correctionDeadline}T23:59:59Z`,
      comment: correctionComment || 'Des pièces justificatives sont manquantes ou non conformes.',
      missingOrInvalidDocs: selectedDeficientDocs,
      isResolved: false
    };

    const updatedDocs = selectedApp.documents.map((d) =>
      selectedDeficientDocs.includes(d.type) && d.status === 'en_attente'
        ? { ...d, status: 'complement_requis' as const }
        : d
    );

    const updated: CandidateApplication = {
      ...selectedApp,
      status: 'correction_demandee',
      documents: updatedDocs,
      assignedReviewerId: currentUser?.id,
      assignedReviewerName: `${currentUser?.firstName} ${currentUser?.lastName}`,
      correctionRequests: [newCorrection, ...selectedApp.correctionRequests],
      statusHistory: [
        {
          id: `sh-${Date.now()}`,
          status: 'correction_demandee',
          comment: `Demande de correction formelle envoyée au candidat (Échéance: ${correctionDeadline}).`,
          changedBy: `${currentUser?.firstName} ${currentUser?.lastName}`,
          timestamp: new Date().toISOString()
        },
        ...selectedApp.statusHistory
      ],
      updatedAt: new Date().toISOString()
    };

    storageService.saveApplication(updated, {
      id: currentUser?.id || 'admin',
      name: `${currentUser?.firstName} ${currentUser?.lastName}`,
      role: 'administration'
    });

    try {
      await fetch(`/api/applications/${selectedApp.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(updated),
      });
    } catch {
      // Non-blocking fallback
    }

    storageService.addNotification({
      targetRole: 'candidat',
      userId: selectedApp.candidateId,
      title: `Régularisation requise — Dossier ${selectedApp.referenceNumber}`,
      message: `Attention : des pièces de votre dossier nécessitent une correction avant le ${correctionDeadline}. Consultez votre espace de correction.`,
      category: 'candidature',
      link: `/candidat/corrections?appId=${selectedApp.id}`
    });

    setAdminActionError(null);
    setCorrectionModalOpen(false);
    setSelectedApp(updated);
    reloadApplications();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 rounded-3xl p-8 text-white shadow-xl space-y-3">
        <div className="inline-flex items-center gap-2 bg-teal-500/20 border border-teal-400/40 px-3 py-1 rounded-full text-teal-300 text-xs font-semibold">
          <ClipboardList className="w-3.5 h-3.5" />
          Module C — Gestion des Dossiers de Candidature
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          File d&apos;Instruction Administrative des Candidatures
        </h1>
        <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
          Contrôle pièce par pièce avec traçabilité de provenance (Administration vs Candidat), demandes de régularisation ciblées et validation de recevabilité.
        </p>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tous les dossiers ({applications.length})
          </button>
          <button
            onClick={() => setStatusFilter('soumise')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'soumise'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Nouveaux / À instruire ({applications.filter((a) => a.status === 'soumise').length})
          </button>
          <button
            onClick={() => setStatusFilter('correction_demandee')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'correction_demandee'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Corrections en cours ({applications.filter((a) => a.status === 'correction_demandee').length})
          </button>
          <button
            onClick={() => setStatusFilter('recevable')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'recevable'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Recevables ({applications.filter((a) => a.status === 'recevable').length})
          </button>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par référence, CIN, nom..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Réf & Date</th>
                <th className="py-3 px-4">Candidat (CIN/CNE)</th>
                <th className="py-3 px-4">Sujet & Labo</th>
                <th className="py-3 px-4">Contrôle Pièces</th>
                <th className="py-3 px-4">Statut & Instructeur</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredApps.map((app) => {
                const docSummary = summarizeApplicationDocuments(app.documents);
                const anomalyCount =
                  docSummary.missingDocs.length +
                  docSummary.rejectedDocs.length +
                  docSummary.complementDocs.length;

                return (
                  <tr key={app.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-slate-900">{app.referenceNumber}</div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(app.submittedAt).toLocaleDateString('fr-FR')}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 space-y-0.5">
                      <div className="font-bold text-slate-900">{app.candidateName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">CIN: {app.cin}</div>
                      <div className="text-[10px] text-slate-400">{app.masterSpecialty}</div>
                    </td>

                    <td className="py-3.5 px-4 max-w-xs truncate">
                      <div className="font-medium text-slate-900 truncate">{app.subjectTitle}</div>
                      <div className="text-[10px] text-teal-700 font-semibold">
                        Labo : {app.laboratoryId.toUpperCase()} • Dir : {app.supervisorName}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 space-y-1">
                      {anomalyCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {docSummary.providedRequiredCount}/{docSummary.totalRequired} fournies • {anomalyCount} anomalie(s)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {docSummary.providedRequiredCount}/{docSummary.totalRequired} fournies ({docSummary.validatedRequiredCount} validées)
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 space-y-0.5">
                      <StatusBadge status={app.status} size="sm" />
                      <div className="text-[10px] text-slate-400">
                        Resp: {app.assignedReviewerName || "En attente d'attribution"}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedApp(app);
                          setEditingReasonDocId(null);
                          setAdminActionError(null);
                        }}
                        className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs transition-colors shadow-2xs inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Instruire</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Instruction Drawer / Modal */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-teal-300">
                    {selectedApp.referenceNumber}
                  </span>
                  <StatusBadge status={selectedApp.status} size="sm" />
                </div>
                <h3 className="font-extrabold text-base mt-1">{selectedApp.candidateName}</h3>
              </div>
              <button
                onClick={() => setSelectedApp(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700">
              {/* Identity & Master details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-400 font-semibold block">Identité & Contact</span>
                  <span className="font-bold text-slate-900">{selectedApp.candidateName}</span>
                  <div className="text-slate-500 font-mono">CIN : {selectedApp.cin}</div>
                  <div className="text-slate-500">{selectedApp.candidateEmail}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block">Master & Mention</span>
                  <span className="font-bold text-slate-900">{selectedApp.masterSpecialty}</span>
                  <div className="text-slate-500">{selectedApp.masterOriginUniversity}</div>
                  <div className="text-emerald-700 font-bold">Mention : {selectedApp.masterMention}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block">Affectation & Thèse</span>
                  <span className="font-bold text-slate-900">{selectedApp.discipline}</span>
                  <div className="text-slate-500">Labo : {selectedApp.laboratoryId.toUpperCase()}</div>
                  <div className="text-slate-500">Dir : {selectedApp.supervisorName}</div>
                </div>
              </div>

              {/* Per-document verification controls */}
              {(() => {
                const modalSummary = summarizeApplicationDocuments(selectedApp.documents);
                return (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700">
                        Contrôle pièce par pièce ({modalSummary.providedRequiredCount}/{modalSummary.totalRequired} fournies • {modalSummary.validatedRequiredCount} validées)
                      </h4>
                      <span className="text-slate-400 text-[11px]">
                        Validation administrative individuelle & provenance
                      </span>
                    </div>

                    {adminActionError && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                        <span>{adminActionError}</span>
                      </div>
                    )}

                    <div className="space-y-2.5">
                      {selectedApp.documents.map((doc) => (
                        <div
                          key={doc.id}
                          className={`p-3.5 rounded-xl border space-y-2.5 ${
                            doc.status === 'manquant' || doc.status === 'rejete'
                              ? 'border-rose-200 bg-rose-50/40'
                              : doc.status === 'complement_requis'
                              ? 'border-amber-200 bg-amber-50/40'
                              : 'border-slate-200 bg-slate-50/60'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-slate-900">{doc.label}</span>
                                {doc.status === 'manquant' && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-200">
                                    Pièce manquante
                                  </span>
                                )}
                                {doc.provenance === 'recupere_administration' ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                                    <Building2 className="w-3 h-3" />
                                    Récupéré depuis l&apos;administration {doc.isDemoApogee ? '(Démo APOGÉE)' : ''}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                                    <UserCheck className="w-3 h-3" />
                                    Fourni par le candidat
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                                <span>
                                  Fichier : <span className="font-mono text-slate-700">{doc.fileName || 'Non fourni'}</span>
                                </span>
                            {(doc.fileName || (doc.fileUrl && doc.fileUrl !== '#')) && (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewDocContext({ appId: selectedApp.id, docId: doc.id })
                                  }
                                  className="inline-flex items-center gap-1 text-teal-800 hover:text-teal-950 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Consulter</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadProtectedDocument(toViewableAppDoc(selectedApp, doc), {
                                      sessionToken,
                                      currentUserId: currentUser?.id,
                                      currentUserEmail: currentUser?.email,
                                      currentUserCin: currentUser?.cin,
                                      activeRole: currentRole,
                                    }).catch(() => undefined)
                                  }
                                  className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0"
                                  title="Télécharger une copie (action secondaire)"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>Télécharger</span>
                                </button>
                              </div>
                            )}
                          </div>
                          {doc.rejectionReason && (
                            <div className="text-[11px] text-rose-700 font-medium bg-rose-50 px-2 py-1 rounded border border-rose-200">
                              Motif : {doc.rejectionReason}
                            </div>
                          )}
                        </div>

                        {/* Status & Per-doc verification buttons */}
                        <div className="shrink-0 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDocumentStatusChange(selectedApp, doc.id, 'valide')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors inline-flex items-center gap-1 ${
                              doc.status === 'valide'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Validé
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingReasonDocId(doc.id);
                              setPendingDocStatus('complement_requis');
                              setReasonDraft(doc.rejectionReason || '');
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors inline-flex items-center gap-1 ${
                              doc.status === 'complement_requis'
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            Complément
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingReasonDocId(doc.id);
                              setPendingDocStatus('rejete');
                              setReasonDraft(doc.rejectionReason || '');
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors inline-flex items-center gap-1 ${
                              doc.status === 'rejete'
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                            }`}
                          >
                            <XCircle className="w-3 h-3" />
                            Rejeter
                          </button>
                        </div>
                      </div>

                      {editingReasonDocId === doc.id && (
                        <div className="p-3 bg-white rounded-xl border border-rose-200 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                          <input
                            type="text"
                            placeholder={
                              pendingDocStatus === 'rejete'
                                ? 'Motif du rejet (ex: scan illisible, document expiré...)'
                                : 'Précisez le complément demandé au candidat...'
                            }
                            value={reasonDraft}
                            onChange={(e) => setReasonDraft(e.target.value)}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                          />
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleDocumentStatusChange(
                                  selectedApp,
                                  doc.id,
                                  pendingDocStatus,
                                  reasonDraft
                                )
                              }
                              className="bg-rose-700 hover:bg-rose-800 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold"
                            >
                              Confirmer
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingReasonDocId(null);
                                setReasonDraft('');
                              }}
                              className="bg-slate-100 text-slate-600 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                    </div>
                  </div>
                );
              })()}

              {/* Status History */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                  Historique d&apos;instruction
                </h4>
                <div className="space-y-1.5">
                  {selectedApp.statusHistory.map((sh) => (
                    <div key={sh.id} className="text-[11px] text-slate-500 flex items-center justify-between bg-slate-50 p-2 rounded-lg">
                      <span><strong>{sh.changedBy}</strong> : {sh.comment || sh.status}</span>
                      <span className="font-mono">{new Date(sh.timestamp).toLocaleTimeString('fr-FR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                onClick={() => setSelectedApp(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Fermer
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap justify-end">
                <button
                  onClick={() => {
                    const flagged = selectedApp.documents
                      .filter(
                        (d) =>
                          d.status === 'rejete' ||
                          d.status === 'complement_requis' ||
                          d.status === 'manquant'
                      )
                      .map((d) => d.type);
                    setSelectedDeficientDocs(flagged);
                    setCorrectionModalOpen(true);
                  }}
                  className="bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Demander régularisation</span>
                </button>

                <button
                  onClick={() => handleValidateRecevable(selectedApp)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Valider comme Recevable</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Correction Notice Modal (Activity 11) */}
      {correctionModalOpen && selectedApp && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Notification de Dossier Incomplet (Activité N°11)</span>
            </div>
            <p className="text-xs text-slate-600">
              Régularisation adressée au candidat {selectedApp.candidateName} pour le dossier {selectedApp.referenceNumber}.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Date limite de correction impérative :
                </label>
                <input
                  type="date"
                  value={correctionDeadline}
                  onChange={(e) => setCorrectionDeadline(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Message explicatif des pièces à rectifier / motifs du rejet :
                </label>
                <textarea
                  rows={4}
                  required
                  value={correctionComment}
                  onChange={(e) => setCorrectionComment(e.target.value)}
                  placeholder="Ex : Relevé de notes S4 non authentifié par le cachet de la faculté. Merci de fournir un duplicata légalisé..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCorrectionModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSendCorrectionNotice}
                className="bg-rose-700 hover:bg-rose-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-colors shadow-xs flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Envoyer la notification automatique</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Integrated Document Viewer Modal with direct validation controls */}
      {(() => {
        if (!previewDocContext) return null;
        const activeApp =
          selectedApp?.id === previewDocContext.appId
            ? selectedApp
            : applications.find((a) => a.id === previewDocContext.appId);
        const activeDoc = activeApp?.documents.find((d) => d.id === previewDocContext.docId);
        if (!activeApp || !activeDoc) return null;

        return (
          <DocumentViewerModal
            document={toViewableAppDoc(activeApp, activeDoc)}
            onClose={() => setPreviewDocContext(null)}
            footerActions={
              <div className="w-full flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-600">
                  <span className="font-semibold text-slate-800">Décision sur cette pièce :</span>
                  <span
                    className={`px-2 py-0.5 rounded font-bold border ${
                      activeDoc.status === 'valide'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : activeDoc.status === 'rejete'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : activeDoc.status === 'complement_requis'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}
                  >
                    {activeDoc.status === 'valide'
                      ? 'Validée'
                      : activeDoc.status === 'rejete'
                      ? 'Rejetée'
                      : activeDoc.status === 'complement_requis'
                      ? 'Complément requis'
                      : 'En attente'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDocumentStatusChange(activeApp, activeDoc.id, 'valide')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
                      activeDoc.status === 'valide'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Validé</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingReasonDocId(activeDoc.id);
                      setPendingDocStatus('complement_requis');
                      setReasonDraft(activeDoc.rejectionReason || '');
                      setPreviewDocContext(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-white text-amber-700 border-amber-200 hover:bg-amber-50 transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Complément</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingReasonDocId(activeDoc.id);
                      setPendingDocStatus('rejete');
                      setReasonDraft(activeDoc.rejectionReason || '');
                      setPreviewDocContext(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-white text-rose-700 border-rose-200 hover:bg-rose-50 transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Rejeter</span>
                  </button>
                </div>
              </div>
            }
          />
        );
      })()}
    </div>
  );
};
