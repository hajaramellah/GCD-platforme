import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Calendar,
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  PlusCircle,
  Users,
  FileSignature,
  GraduationCap,
  Layers
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import {
  DoctoralTraining,
  TrainingSession,
  TrainingActivity,
  DoctoralCreditRecord
} from '../../types';

export const DoctoralTrainingDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [trainings, setTrainings] = useState<DoctoralTraining[]>(() =>
    storageService.getDoctoralTrainings()
  );
  const [sessions, setSessions] = useState<TrainingSession[]>(() =>
    storageService.getTrainingSessions()
  );
  const [activities, setActivities] = useState<TrainingActivity[]>(() =>
    storageService.getTrainingActivities()
  );
  const [creditRecords, setCreditRecords] = useState<DoctoralCreditRecord[]>(() =>
    storageService.getCreditRecords()
  );

  const [activeTab, setActiveTab] = useState<'formations' | 'sessions' | 'activites' | 'credits'>(
    'formations'
  );
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Add new training modal/inline form
  const [showNewTraining, setShowNewTraining] = useState(false);
  const [newTrainingTitle, setNewTrainingTitle] = useState('');
  const [newTrainingCode, setNewTrainingCode] = useState('FD-SCI-310');
  const [newTrainingCategory, setNewTrainingCategory] =
    useState<DoctoralTraining['category']>('scientifique');
  const [newTrainingHours, setNewTrainingHours] = useState(24);
  const [newTrainingCredits, setNewTrainingCredits] = useState(4);

  // Add new session form
  const [showNewSession, setShowNewSession] = useState(false);
  const [selectedTrainingId, setSelectedTrainingId] = useState(trainings[0]?.id || '');
  const [sessionDate, setSessionDate] = useState('2026-12-05');
  const [sessionLocation, setSessionLocation] = useState('Salle Séminaires CEDoc — FSDM Fès');
  const [sessionMode, setSessionMode] = useState<TrainingSession['mode']>('presentiel');

  const actor = {
    id: currentUser?.id || 'usr-formation-1',
    name: `Pr. ${currentUser?.firstName || 'Mustapha'} ${currentUser?.lastName || 'El Ouazzani'}`,
    role: 'responsable_formation' as const
  };

  const refreshAll = () => {
    setTrainings(storageService.getDoctoralTrainings());
    setSessions(storageService.getTrainingSessions());
    setActivities(storageService.getTrainingActivities());
    setCreditRecords(storageService.getCreditRecords());
  };

  const handleCreateTraining = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrainingTitle.trim()) return;
    const item: DoctoralTraining = {
      id: `form-${Date.now()}`,
      code: newTrainingCode.trim() || `FD-${Date.now().toString().slice(-3)}`,
      title: newTrainingTitle.trim(),
      category: newTrainingCategory,
      laboratoryId: 'lisac',
      establishmentId: 'fsdm',
      trainerName: actor.name,
      credits: Number(newTrainingCredits) || 4,
      hours: Number(newTrainingHours) || 20,
      description: 'Module doctoral enregistré depuis le tableau de bord CEDoc USMBA.',
      academicYear: '2026-2027',
      status: 'ouverte'
    };
    storageService.saveDoctoralTraining(item, actor);
    refreshAll();
    setNewTrainingTitle('');
    setShowNewTraining(false);
    setFeedbackMsg(`Formation doctorale « ${item.title} » ajoutée au programme CEDoc.`);
  };

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    const tr = trainings.find((t) => t.id === selectedTrainingId) || trainings[0];
    if (!tr) return;
    const sess: TrainingSession = {
      id: `sess-${Date.now()}`,
      trainingId: tr.id,
      trainingTitle: tr.title,
      date: sessionDate,
      startTime: '09:30',
      endTime: '13:00',
      location: sessionLocation.trim() || 'CEDoc USMBA',
      mode: sessionMode,
      capacity: 35,
      enrolledCount: 0,
      status: 'planifiee'
    };
    storageService.saveTrainingSession(sess, actor);
    refreshAll();
    setShowNewSession(false);
    setFeedbackMsg(`Session du ${sess.date} programmée pour « ${tr.title} ».`);
  };

  const handleValidateActivity = (activityId: string, decision: 'validee' | 'refusee') => {
    storageService.validateTrainingActivity(activityId, decision, actor);
    refreshAll();
    setFeedbackMsg(
      decision === 'validee'
        ? 'Activité validée et crédits/heures automatiquement imputés sur le suivi du doctorant.'
        : 'Activité marquée comme non retenue.'
    );
  };

  const pendingActivitiesCount = activities.filter((a) => a.status === 'en_attente').length;
  const totalValidatedHours = creditRecords.reduce((acc, r) => acc + r.validatedHours, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-8 text-white shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/40 px-3 py-1 rounded-full text-indigo-200 text-xs font-semibold">
            <GraduationCap className="w-3.5 h-3.5" />
            Espace Responsable Formation Doctorale — CEDoc USMBA
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {actor.name}
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm max-w-2xl">
            Pilotage des formations doctorales, programmation des sessions, validation des activités scientifiques et suivi réglementaire des crédits (200h / 30 crédits).
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Link
            to="/formation/entretiens"
            className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors shadow-xs"
          >
            <Calendar className="w-4 h-4" />
            <span>Coordination Entretiens</span>
          </Link>
          <Link
            to="/formation/pv-validation"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors"
          >
            <FileSignature className="w-4 h-4 text-indigo-300" />
            <span>Validation PV</span>
          </Link>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-2xl font-black text-slate-900">{trainings.length}</div>
          <div className="text-xs text-slate-500 mt-1 font-medium">Formations Doctorales Cataloguées</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-indigo-200 bg-indigo-50/20 shadow-2xs">
          <div className="text-2xl font-black text-indigo-700">{sessions.length}</div>
          <div className="text-xs text-indigo-900 mt-1 font-semibold">Sessions Programmées / Réalisées</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-2xs">
          <div className="text-2xl font-black text-amber-700">{pendingActivitiesCount}</div>
          <div className="text-xs text-amber-900 mt-1 font-semibold">Activités en Attente de Visa</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-2xs">
          <div className="text-2xl font-black text-emerald-700">{totalValidatedHours} h</div>
          <div className="text-xs text-emerald-900 mt-1 font-semibold">Volume Horaire Validé (Suivi Doctorants)</div>
        </div>
      </div>

      {feedbackMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('formations')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'formations' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Formations doctorales ({trainings.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sessions')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'sessions' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Sessions ({sessions.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('activites')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'activites' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Activités ({activities.length})</span>
          {pendingActivitiesCount > 0 && (
            <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
              {pendingActivitiesCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('credits')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'credits' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Suivi des crédits ({creditRecords.length})</span>
        </button>
      </div>

      {/* TAB 1: FORMATIONS DOCTORALES */}
      {activeTab === 'formations' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-bold text-base text-slate-900">Catalogue des Formations Doctorales</h2>
              <p className="text-xs text-slate-500">
                Modules scientifiques, méthodologiques, transversaux et linguistiques accrédités par le CEDoc.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewTraining(!showNewTraining)}
              className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Nouvelle formation</span>
            </button>
          </div>

          {showNewTraining && (
            <form
              onSubmit={handleCreateTraining}
              className="p-5 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs"
            >
              <input
                type="text"
                required
                placeholder="Intitulé de la formation..."
                value={newTrainingTitle}
                onChange={(e) => setNewTrainingTitle(e.target.value)}
                className="sm:col-span-2 bg-white border border-slate-200 rounded-xl px-3 py-2"
              />
              <input
                type="text"
                placeholder="Code (ex: FD-SCI-310)"
                value={newTrainingCode}
                onChange={(e) => setNewTrainingCode(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono"
              />
              <select
                value={newTrainingCategory}
                onChange={(e) =>
                  setNewTrainingCategory(e.target.value as DoctoralTraining['category'])
                }
                className="bg-white border border-slate-200 rounded-xl px-3 py-2"
              >
                <option value="scientifique">Scientifique</option>
                <option value="methodologique">Méthodologique</option>
                <option value="transversale">Transversale</option>
                <option value="langues">Langues</option>
              </select>
              <div className="flex items-center gap-2">
                <label className="text-slate-500">Heures:</label>
                <input
                  type="number"
                  min={4}
                  max={100}
                  value={newTrainingHours}
                  onChange={(e) => setNewTrainingHours(Number(e.target.value))}
                  className="w-20 bg-white border border-slate-200 rounded-xl px-2.5 py-2"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-slate-500">Crédits:</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={newTrainingCredits}
                  onChange={(e) => setNewTrainingCredits(Number(e.target.value))}
                  className="w-20 bg-white border border-slate-200 rounded-xl px-2.5 py-2"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewTraining(false)}
                  className="px-3 py-2 text-slate-600 font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl"
                >
                  Enregistrer le module
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {trainings.map((tr) => (
              <div
                key={tr.id}
                className="p-5 rounded-2xl border border-slate-200 bg-white space-y-2.5 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-200">
                    {tr.code}
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    {tr.hours}h • {tr.credits} crédits
                  </span>
                </div>
                <h3 className="font-bold text-sm text-slate-900">{tr.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{tr.description}</p>
                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between">
                  <span>Responsable : <strong>{tr.trainerName}</strong></span>
                  <span className="uppercase font-semibold text-slate-600">{tr.category}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: SESSIONS DE FORMATION */}
      {activeTab === 'sessions' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-bold text-base text-slate-900">Calendrier des Sessions Doctorales</h2>
              <p className="text-xs text-slate-500">
                Planification des séances présentielles, hybrides ou à distance et suivi des capacités.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewSession(!showNewSession)}
              className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Programmer une session</span>
            </button>
          </div>

          {showNewSession && (
            <form
              onSubmit={handleCreateSession}
              className="p-5 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs"
            >
              <select
                value={selectedTrainingId}
                onChange={(e) => setSelectedTrainingId(e.target.value)}
                className="sm:col-span-2 bg-white border border-slate-200 rounded-xl px-3 py-2"
              >
                {trainings.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.code}] {t.title}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2"
              />
              <select
                value={sessionMode}
                onChange={(e) => setSessionMode(e.target.value as TrainingSession['mode'])}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2"
              >
                <option value="presentiel">Présentiel</option>
                <option value="hybride">Hybride</option>
                <option value="distanciel">Distanciel</option>
              </select>
              <input
                type="text"
                value={sessionLocation}
                onChange={(e) => setSessionLocation(e.target.value)}
                placeholder="Lieu ou lien visio..."
                className="sm:col-span-3 bg-white border border-slate-200 rounded-xl px-3 py-2"
              />
              <button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl"
              >
                Confirmer la session
              </button>
            </form>
          )}

          <div className="space-y-3">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className="p-5 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded">
                      {sess.date} • {sess.startTime} - {sess.endTime}
                    </span>
                    <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {sess.mode}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        sess.status === 'terminee'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-sky-50 text-sky-700 border border-sky-200'
                      }`}
                    >
                      {sess.status === 'terminee' ? 'Terminée' : 'Planifiée'}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm text-slate-900">{sess.trainingTitle}</h3>
                  <p className="text-xs text-slate-500">Lieu : {sess.location}</p>
                </div>
                <div className="text-right text-xs shrink-0">
                  <div className="text-slate-400 font-semibold">Inscrits</div>
                  <div className="font-black text-slate-900 text-sm">
                    {sess.enrolledCount} / {sess.capacity}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: ACTIVITÉS SCIENTIFIQUES & VALIDATION */}
      {activeTab === 'activites' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="font-bold text-base text-slate-900">
              Validation des Activités Scientifiques & Formations
            </h2>
            <p className="text-xs text-slate-500">
              La validation d&apos;une activité crédite automatiquement les heures et crédits doctoraux du doctorant concerné.
            </p>
          </div>

          <div className="space-y-3">
            {activities.map((act) => (
              <div
                key={act.id}
                className={`p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  act.status === 'en_attente'
                    ? 'border-amber-300 bg-amber-50/30'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{act.studentName}</span>
                    <span className="text-[11px] font-mono text-slate-500">CNE: {act.cne}</span>
                    <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                      +{act.hours}h / +{act.creditsEarned} crédits
                    </span>
                    {act.status === 'validee' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" /> Validée
                      </span>
                    )}
                    {act.status === 'en_attente' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <Clock className="w-3 h-3" /> En attente
                      </span>
                    )}
                    {act.status === 'refusee' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                        <XCircle className="w-3 h-3" /> Non retenue
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-semibold text-slate-800">{act.title}</div>
                  <div className="text-[11px] text-slate-500">
                    Programme : {act.trainingTitle} • Date : {act.date}
                  </div>
                </div>

                {act.status === 'en_attente' ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleValidateActivity(act.id, 'validee')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Valider (+{act.creditsEarned} cr.)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleValidateActivity(act.id, 'refusee')}
                      className="bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold px-3 py-2 rounded-xl text-xs"
                    >
                      Refuser
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 font-medium">
                    Visé par : {act.validatedBy || actor.name}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SUIVI DES CRÉDITS */}
      {activeTab === 'credits' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden p-6 sm:p-8 space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="font-bold text-base text-slate-900">
              Suivi Réglementaire des Crédits & Heures Doctorales
            </h2>
            <p className="text-xs text-slate-500">
              Progression cumulée par doctorant (seuil réglementaire de soutenance : 200 heures / 30 crédits CEDoc).
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                  <th className="py-3 px-4">Doctorant</th>
                  <th className="py-3 px-4">Labo & Directeur</th>
                  <th className="py-3 px-4">Année</th>
                  <th className="py-3 px-4">Heures Validées</th>
                  <th className="py-3 px-4">Crédits Validés</th>
                  <th className="py-3 px-4">Conformité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {creditRecords.map((rec) => {
                  const pct = Math.min(100, Math.round((rec.validatedHours / rec.requiredHours) * 100));
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{rec.studentName}</div>
                        <div className="text-[11px] font-mono text-slate-500">CNE : {rec.cne}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-teal-700">{rec.laboratoryId.toUpperCase()}</div>
                        <div className="text-[11px] text-slate-500">{rec.supervisorName}</div>
                      </td>
                      <td className="py-3.5 px-4 font-bold">{rec.thesisYear}e année</td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">
                          {rec.validatedHours} / {rec.requiredHours} h ({pct}%)
                        </div>
                        <div className="w-32 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-indigo-800">
                        {rec.validatedCredits} / {rec.requiredCredits} crédits
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                            rec.status === 'conforme'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-sky-50 text-sky-700 border-sky-200'
                          }`}
                        >
                          {rec.status === 'conforme' ? 'Quota atteint' : 'En progression'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
