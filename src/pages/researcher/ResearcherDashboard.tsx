import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  PlusCircle,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Edit,
  Archive,
  Eye,
  Check,
  Send
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { StatusBadge } from '../../components/common/StatusBadge';
import { SubjectStatus } from '../../types';

export const ResearcherDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [subjects, setSubjects] = useState(() => storageService.getSubjects());
  const applications = storageService.getApplications();
  const supervisedStudents = storageService.getAnnualReRegistrations().filter(
    (r) =>
      r.supervisorId === currentUser?.id ||
      r.supervisorName.toLowerCase().includes(currentUser?.lastName.toLowerCase() || '')
  );

  const mySubjects = subjects.filter(
    (s) =>
      s.supervisorId === currentUser?.id ||
      s.professeur_id === currentUser?.id ||
      s.supervisorName?.toLowerCase().includes(currentUser?.lastName.toLowerCase() || '') ||
      s.professeur_nom?.toLowerCase().includes(currentUser?.lastName.toLowerCase() || '')
  );

  const pendingCount = mySubjects.filter((s) => (s.status || s.statut) === 'en_attente_validation').length;
  const validatedCount = mySubjects.filter((s) => (s.status || s.statut) === 'valide' || (s.status || s.statut) === 'publie').length;
  const correctionCount = mySubjects.filter((s) => (s.status || s.statut) === 'correction_demandee').length;
  const archivedCount = mySubjects.filter((s) => (s.status || s.statut) === 'archive').length;

  const handleToggleStatus = (subjectId: string, currentStatus: SubjectStatus) => {
    const newStatus: SubjectStatus = currentStatus === 'archive' ? 'valide' : 'archive';
    const actorRole = currentUser?.currentRole || 'enseignant_chercheur';
    const actorName = currentUser
      ? `Pr. ${currentUser.firstName} ${currentUser.lastName}`
      : 'Enseignant-Chercheur';

    storageService.toggleSubjectStatus(subjectId, newStatus, {
      id: currentUser?.id || 'chercheur',
      name: actorName,
      role: actorRole
    });

    setSubjects(storageService.getSubjects());
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 rounded-3xl p-8 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 text-teal-300 bg-teal-500/20 border border-teal-400/40 px-3 py-1 rounded-full text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Espace Enseignant-Chercheur & Encadrant de Thèse
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Pr. {currentUser?.firstName} {currentUser?.lastName}
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm">
            Laboratoire de rattachement : <span className="font-bold text-teal-300">{currentUser?.laboratoryId?.toUpperCase() || 'LISAC'}</span> • Session Doctorale 2026-2027
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/chercheur/proposer-sujet"
            className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition-colors shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Proposer un Sujet de Thèse</span>
          </Link>

          <Link
            to="/chercheur/candidatures"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors backdrop-blur-xs"
          >
            <Users className="w-4 h-4 text-teal-300" />
            <span>Examiner les Candidatures</span>
          </Link>

          <Link
            to="/directeur/doctorants"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors backdrop-blur-xs"
          >
            <Eye className="w-4 h-4 text-teal-300" />
            <span>Doctorants Encadrés ({supervisedStudents.length})</span>
          </Link>

          <Link
            to="/sujets"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors backdrop-blur-xs"
          >
            <BookOpen className="w-4 h-4 text-teal-300" />
            <span>Catalogue Public</span>
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-2xl font-black text-slate-900">{mySubjects.length}</div>
          <div className="text-xs text-slate-500 mt-1 font-medium">Sujets Enregistrés au Total</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-2xs">
          <div className="text-2xl font-black text-emerald-700">{validatedCount}</div>
          <div className="text-xs text-emerald-800 mt-1 font-semibold">Validés ou Publiés</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-2xs">
          <div className="text-2xl font-black text-amber-700">{pendingCount}</div>
          <div className="text-xs text-amber-800 mt-1 font-semibold">En Attente de Visa Labo</div>
        </div>
        <Link
          to="/directeur/doctorants"
          className="bg-white p-5 rounded-2xl border border-indigo-200 bg-indigo-50/20 shadow-2xs hover:border-indigo-400 transition-colors"
        >
          <div className="text-2xl font-black text-indigo-700">{supervisedStudents.length}</div>
          <div className="text-xs text-indigo-900 mt-1 font-semibold flex items-center justify-between">
            <span>Doctorants Encadrés (Suivi)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </Link>
      </div>

      {/* My Subjects Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-6 sm:p-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-base text-slate-900">Mes Propositions & Sujets Doctoraux</h3>
            <p className="text-xs text-slate-500">Gérez l'édition, la publication ou le retrait de vos thématiques et suivez les candidatures</p>
          </div>
          <Link
            to="/chercheur/proposer-sujet"
            className="text-xs font-bold text-teal-700 hover:underline inline-flex items-center gap-1"
          >
            <PlusCircle className="w-4 h-4" />
            Nouveau sujet
          </Link>
        </div>

        <div className="space-y-3">
          {mySubjects.map((sub) => {
            const subjectApps = applications.filter((a) => a.subjectId === sub.id);
            const status = sub.status || sub.statut;
            const isArchived = status === 'archive';

            return (
              <div
                key={sub.id}
                className="p-5 rounded-2xl border border-slate-200 hover:border-slate-300 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={status} />
                    <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded">
                      {sub.domaine || sub.discipline}
                    </span>
                    {sub.specialite && (
                      <span className="text-xs text-slate-400">
                        • {sub.specialite}
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 leading-snug">{sub.title || sub.titre}</h4>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {sub.problematique || sub.abstract || sub.description}
                  </p>

                  {sub.correctionComment && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 mt-2">
                      <strong>Remarque du directeur de laboratoire :</strong> {sub.correctionComment}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                  <div className="text-right text-xs mr-2">
                    <span className="text-slate-400 block font-medium">Candidats</span>
                    <span className="font-bold text-slate-900">{subjectApps.length} dossier(s)</span>
                  </div>

                  {/* Edit button */}
                  <Link
                    to={`/chercheur/proposer-sujet?edit=${sub.id}`}
                    className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Modifier</span>
                  </Link>

                  {/* Publish / Archive Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(sub.id, status as SubjectStatus)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      isArchived
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700'
                    }`}
                    title={isArchived ? 'Publier au catalogue' : 'Retirer / Archiver le sujet'}
                  >
                    {isArchived ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Publier</span>
                      </>
                    ) : (
                      <>
                        <Archive className="w-3.5 h-3.5" />
                        <span>Retirer</span>
                      </>
                    )}
                  </button>

                  {/* Applicants view */}
                  <Link
                    to="/chercheur/candidatures"
                    className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-xs"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Candidats ({subjectApps.length})</span>
                  </Link>
                </div>
              </div>
            );
          })}

          {mySubjects.length === 0 && (
            <div className="text-center py-12 text-xs text-slate-500 space-y-2">
              <p>Vous n'avez pas encore proposé de sujet doctoral pour cette session.</p>
              <Link
                to="/chercheur/proposer-sujet"
                className="inline-flex items-center gap-1.5 text-teal-700 font-bold hover:underline"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Déposer ma première proposition de sujet</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
