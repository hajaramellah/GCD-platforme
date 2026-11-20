import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Users,
  Send,
  ArrowRight,
  Sparkles,
  Layers,
  Award,
  HelpCircle,
  ShieldCheck,
  Save
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { ESTABLISHMENTS, LABORATORIES } from '../../data/seedData';
import { DoctoralSubject, SubjectStatus } from '../../types';

const SCIENTIFIC_DOMAINS = [
  'Informatique et Intelligence Artificielle',
  'Mathématiques et Physique',
  'Électronique et Télécommunications',
  'Chimie et Sciences des matériaux',
  'Biologie et Biotechnologie',
  'Environnement et Sciences de la Terre',
  'Économie et Gestion',
  'Droit et Sciences politiques',
  'Lettres, Langues et Sciences humaines',
  'Sciences de l\'éducation'
];

export const ProposeSubjectForm: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    domaine: 'Informatique et Intelligence Artificielle',
    specialite: 'Intelligence Artificielle & Systèmes Embarqués',
    establishmentId: currentUser?.establishmentId || 'fsdm',
    laboratoryId: currentUser?.laboratoryId || 'lisac',
    coSupervisorName: '',
    maxCandidates: 1,
    problematique: '',
    objectives: '',
    abstract: '',
    methodology: '',
    prerequisites: '',
    keywordsInput: 'Deep Learning, Edge AI, IoT, Analyse de Données',
    status: 'en_attente_validation' as SubjectStatus
  });

  const [submittedSubject, setSubmittedSubject] = useState<DoctoralSubject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // If in edit mode, load subject data
  useEffect(() => {
    if (editId) {
      const existing = storageService.getSubjectById(editId);
      if (existing) {
        setIsEditing(true);
        setFormData({
          title: existing.title || existing.titre || '',
          domaine: existing.domaine || existing.discipline || 'Informatique et Intelligence Artificielle',
          specialite: existing.specialite || existing.discipline || '',
          establishmentId: existing.establishmentId || existing.etablissement?.toLowerCase() || 'fsdm',
          laboratoryId: existing.laboratoryId || existing.laboratoire?.toLowerCase() || 'lisac',
          coSupervisorName: existing.coSupervisorName || '',
          maxCandidates: existing.maxCandidates || 1,
          problematique: existing.problematique || '',
          objectives: existing.objectives || existing.objectifs || '',
          abstract: existing.abstract || existing.description || '',
          methodology: existing.methodology || '',
          prerequisites: existing.prerequisites || '',
          keywordsInput: (existing.keywords || existing.mots_cles || []).join(', '),
          status: (existing.status || existing.statut || 'en_attente_validation') as SubjectStatus
        });
      }
    }
  }, [editId]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formData.title || !formData.abstract || !formData.objectives || !formData.prerequisites) {
      setErrorMsg('Veuillez compléter l\'ensemble des champs obligatoires marqués d\'un astérisque.');
      return;
    }

    const keywords = formData.keywordsInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const profFullName = currentUser
      ? `Pr. ${currentUser.firstName} ${currentUser.lastName}`
      : 'Pr. Abdelhafid EL ALAOUI';

    const subjectPayload: DoctoralSubject = {
      id: editId || `suj-${Date.now()}`,
      title: formData.title,
      titre: formData.title,
      domaine: formData.domaine,
      discipline: formData.domaine,
      specialite: formData.specialite,
      establishmentId: formData.establishmentId,
      etablissement: formData.establishmentId.toUpperCase(),
      laboratoryId: formData.laboratoryId,
      laboratoire: formData.laboratoryId.toUpperCase(),
      supervisorId: currentUser?.id || 'usr-chercheur-1',
      supervisorName: profFullName,
      professeur_id: currentUser?.id || 'usr-chercheur-1',
      professeur_nom: profFullName,
      coSupervisorName: formData.coSupervisorName || undefined,
      problematique: formData.problematique,
      objectives: formData.objectives,
      objectifs: formData.objectives,
      abstract: formData.abstract,
      description: formData.abstract,
      methodology: formData.methodology,
      prerequisites: formData.prerequisites,
      keywords,
      mots_cles: keywords,
      maxCandidates: Number(formData.maxCandidates),
      type_sujet: 'officiel',
      status: formData.status,
      statut: formData.status,
      submissionDate: new Date().toISOString(),
      date_creation: new Date().toISOString(),
      academicYear: '2026-2027'
    };

    storageService.saveSubject(subjectPayload, {
      id: currentUser?.id || 'chercheur',
      name: profFullName,
      role: 'enseignant_chercheur'
    });

    // Notify lab manager if newly proposed or updated
    storageService.addNotification({
      targetRole: 'responsable_labo',
      title: isEditing ? 'Sujet doctoral mis à jour' : 'Nouveau sujet doctoral soumis pour visa',
      message: `${profFullName} a ${isEditing ? 'modifié' : 'soumis'} le sujet "${subjectPayload.title.substring(0, 45)}..." pour validation.`,
      category: 'sujet',
      link: '/labo/validation-sujets'
    });

    setSubmittedSubject(subjectPayload);
  };

  if (submittedSubject) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <div className="bg-white rounded-3xl border border-emerald-200 shadow-xl p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-emerald-950">
            {isEditing ? 'Sujet Doctoral Mis à Jour avec Succès !' : 'Proposition de Sujet Enregistrée avec Succès !'}
          </h2>
          <p className="text-xs sm:text-sm text-emerald-800 max-w-lg mx-auto leading-relaxed">
            Votre sujet <strong>"{submittedSubject.title}"</strong> est enregistré dans la base de données.
            {submittedSubject.status === 'valide' || submittedSubject.status === 'publie' ? (
              <span className="block mt-1 font-semibold text-emerald-900">
                Le sujet est actuellement visible dans le catalogue officiel des thèses doctorales.
              </span>
            ) : (
              <span className="block mt-1">
                Il est actuellement dans le circuit de validation du laboratoire <strong>{submittedSubject.laboratoryId.toUpperCase()}</strong>.
              </span>
            )}
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/chercheur/dashboard"
              className="bg-emerald-800 hover:bg-emerald-900 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-colors shadow-xs"
            >
              Retour à mon tableau de bord
            </Link>
            <Link
              to="/sujets"
              className="bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-bold px-5 py-2.5 rounded-xl text-xs transition-colors"
            >
              Consulter dans le Catalogue
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 rounded-3xl p-8 text-white shadow-xl space-y-3">
        <div className="inline-flex items-center gap-2 bg-teal-500/20 border border-teal-400/40 px-3 py-1 rounded-full text-teal-300 text-xs font-semibold">
          <FileText className="w-3.5 h-3.5" />
          {isEditing ? 'Modification d\'un Sujet de Recherche' : 'Formulaire Standardisé de Proposition de Sujet'}
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          {isEditing ? 'Modifier la Fiche du Sujet Doctoral' : 'Proposer un Nouveau Sujet Doctoral (GCD)'}
        </h1>
        <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
          Renseignez la thématique scientifique, la problématique, les objectifs de recherche, les compétences requises et le laboratoire de rattachement conformément aux normes de l'école doctorale USMBA.
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs space-y-6">
        {/* Title */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Intitulé complet du sujet de thèse <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            name="title"
            required
            value={formData.title}
            onChange={handleChange}
            placeholder="ex: Architectures d'Apprentissage Profond et Vision par Ordinateur pour..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 font-semibold shadow-2xs"
          />
        </div>

        {/* Domaine Scientifique & Spécialité */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-teal-700" />
              Domaine Scientifique USMBA <span className="text-rose-500">*</span>
            </label>
            <select
              name="domaine"
              value={formData.domaine}
              onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
            >
              {SCIENTIFIC_DOMAINS.map((dom) => (
                <option key={dom} value={dom}>
                  {dom}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-teal-700" />
              Spécialité précise <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              name="specialite"
              required
              value={formData.specialite}
              onChange={handleChange}
              placeholder="ex: Vision par Ordinateur, Matériaux Avancés, Économétrie..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Establishments & Lab & Statut */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              Établissement USMBA <span className="text-rose-500">*</span>
            </label>
            <select
              name="establishmentId"
              value={formData.establishmentId}
              onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {ESTABLISHMENTS.map((est) => (
                <option key={est.id} value={est.id}>
                  {est.shortName} — {est.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              Laboratoire de Rattachement <span className="text-rose-500">*</span>
            </label>
            <select
              name="laboratoryId"
              value={formData.laboratoryId}
              onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {LABORATORIES.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.code} ({lab.establishmentId.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
              Statut de publication
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 font-semibold"
            >
              <option value="en_attente_validation">En attente de visa laboratoire</option>
              <option value="valide">Validé & Publié au catalogue</option>
              <option value="publie">Publié</option>
              <option value="archive">Archivé / Retiré</option>
            </select>
          </div>
        </div>

        {/* Co-supervisor & Max Candidates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              Co-Directeur de Thèse (Facultatif)
            </label>
            <input
              type="text"
              name="coSupervisorName"
              value={formData.coSupervisorName}
              onChange={handleChange}
              placeholder="ex: Pr. Fatima-Zahra BENCHEIKH"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              Nombre de bourses / places maximales <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              max="5"
              name="maxCandidates"
              value={formData.maxCandidates}
              onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Problématique scientifique */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-teal-700" />
            <span>Problématique scientifique centrale</span> <span className="text-rose-500">*</span>
          </label>
          <textarea
            name="problematique"
            rows={3}
            required
            value={formData.problematique}
            onChange={handleChange}
            placeholder="Énoncez clairement la question scientifique fondamentale à laquelle la thèse se propose de répondre..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Abstract / Description */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Description détaillée & Contexte de la thèse <span className="text-rose-500">*</span>
          </label>
          <textarea
            name="abstract"
            rows={4}
            required
            value={formData.abstract}
            onChange={handleChange}
            placeholder="Décrivez le cadre de recherche, l'état de l'art, et les applications envisagées pour cette thèse..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Objectives */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Objectifs de recherche attendus <span className="text-rose-500">*</span>
          </label>
          <textarea
            name="objectives"
            rows={3}
            required
            value={formData.objectives}
            onChange={handleChange}
            placeholder="1. Développement d'un cadre conceptuel. 2. Expérimentations et validations comparatives. 3. Publication d'articles internationaux..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Methodology */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Méthodologie de recherche envisagée
          </label>
          <textarea
            name="methodology"
            rows={3}
            value={formData.methodology}
            onChange={handleChange}
            placeholder="Démarche expérimentale, outils numériques, plateformes matérielles ou cohortes..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Prerequisites */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Profil du candidat, compétences & prérequis académiques <span className="text-rose-500">*</span>
          </label>
          <textarea
            name="prerequisites"
            rows={3}
            required
            value={formData.prerequisites}
            onChange={handleChange}
            placeholder="Master ou diplôme d'ingénieur en... Solides compétences en... Maîtrise des outils informatiques/statistiques..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Keywords */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Mots-clés (séparés par des virgules) <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            name="keywordsInput"
            required
            value={formData.keywordsInput}
            onChange={handleChange}
            placeholder="ex: Deep Learning, Cybersécurité, Vision par Ordinateur"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <Link
            to="/chercheur/dashboard"
            className="text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            Annuler
          </Link>

          <button
            type="submit"
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-8 py-3 rounded-xl text-xs transition-colors shadow-xs flex items-center gap-2"
          >
            {isEditing ? <Save className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            <span>{isEditing ? 'Enregistrer les modifications' : 'Soumettre le sujet pour validation'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
