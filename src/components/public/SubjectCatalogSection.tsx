import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  BookOpen,
  Building2,
  Users,
  CheckCircle2,
  Tag,
  ArrowRight,
  X,
  FileText,
  Sparkles,
  ChevronDown,
  UserCheck,
  HelpCircle,
  Award,
  Layers,
  GraduationCap,
  ShieldCheck,
  RefreshCw,
  SlidersHorizontal,
  BookmarkPlus
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { ESTABLISHMENTS, LABORATORIES } from '../../data/seedData';
import { DoctoralSubject, User } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge } from '../common/StatusBadge';

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
  "Sciences de l'éducation",
];

interface SubjectCatalogSectionProps {
  compactHeader?: boolean;
  defaultStatusFilter?: string;
}

export const SubjectCatalogSection: React.FC<SubjectCatalogSectionProps> = ({
  compactHeader = false,
  defaultStatusFilter = 'all',
}) => {
  const { currentUser, currentRole, switchRoleQuick } = useAuth();
  const navigate = useNavigate();

  const [subjectsList, setSubjectsList] = useState<DoctoralSubject[]>(() => storageService.getSubjects());
  const [professorsList] = useState<User[]>(() => storageService.getProfessors());

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('all');
  const [selectedSpecialty, setSelectedSpecialty] = useState('all');
  const [selectedEstablishment, setSelectedEstablishment] = useState('all');
  const [selectedLaboratory, setSelectedLaboratory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState(defaultStatusFilter);
  const [selectedType, setSelectedType] = useState<'all' | 'officiel' | 'indicatif'>('all');

  // Professor Filter (multi-select)
  const [selectedProfessors, setSelectedProfessors] = useState<string[]>([]);
  const [professorSearchQuery, setProfessorSearchQuery] = useState('');
  const [isProfDropdownOpen, setIsProfDropdownOpen] = useState(false);
  const profDropdownRef = useRef<HTMLDivElement>(null);

  // Modal State
  const [selectedSubject, setSelectedSubject] = useState<DoctoralSubject | null>(null);
  const [assigningProfId, setAssigningProfId] = useState<string>('');
  const [assignmentNotice, setAssignmentNotice] = useState<string | null>(null);
  const [roleNotice, setRoleNotice] = useState<string | null>(null);

  // Visible count pagination for snappy rendering of 100+ subjects on Home
  const [visibleLimit, setVisibleLimit] = useState<number>(compactHeader ? 12 : 120);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profDropdownRef.current && !profDropdownRef.current.contains(event.target as Node)) {
        setIsProfDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableSpecialties = useMemo(() => {
    const list = subjectsList
      .filter((s) => selectedDomain === 'all' || s.domaine === selectedDomain || s.discipline === selectedDomain)
      .map((s) => s.specialite || s.discipline)
      .filter(Boolean) as string[];
    return Array.from(new Set(list)).sort();
  }, [subjectsList, selectedDomain]);

  const filteredProfessors = useMemo(() => {
    const q = professorSearchQuery.toLowerCase().trim();
    if (!q) return professorsList;
    return professorsList.filter((p) => {
      const full = `${p.firstName} ${p.lastName} ${p.email} ${p.establishmentId || ''}`.toLowerCase();
      return full.includes(q);
    });
  }, [professorsList, professorSearchQuery]);

  const filteredSubjects = useMemo(() => {
    return subjectsList.filter((sub) => {
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const titleMatch = sub.title?.toLowerCase().includes(q) || sub.titre?.toLowerCase().includes(q);
        const descMatch = (sub.abstract || sub.description || '').toLowerCase().includes(q);
        const probMatch = (sub.problematique || '').toLowerCase().includes(q);
        const profMatch = (sub.supervisorName || sub.professeur_nom || '').toLowerCase().includes(q);
        const kwMatch = (sub.keywords || sub.mots_cles || []).some((k) => k.toLowerCase().includes(q));
        const specMatch = (sub.specialite || sub.discipline || '').toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !probMatch && !profMatch && !kwMatch && !specMatch) {
          return false;
        }
      }

      if (selectedProfessors.length > 0) {
        const isUnassigned = !sub.supervisorId && !sub.professeur_id;
        const matchesAnyProf = selectedProfessors.some((pId) => {
          if (pId === '__unassigned__') return isUnassigned;
          return sub.supervisorId === pId || sub.professeur_id === pId;
        });
        if (!matchesAnyProf) return false;
      }

      if (selectedDomain !== 'all') {
        const subDom = sub.domaine || sub.discipline;
        if (subDom !== selectedDomain) return false;
      }

      if (selectedSpecialty !== 'all') {
        const subSpec = sub.specialite || sub.discipline;
        if (subSpec !== selectedSpecialty) return false;
      }

      if (selectedEstablishment !== 'all') {
        const estId = sub.establishmentId || sub.etablissement?.toLowerCase();
        if (estId !== selectedEstablishment) return false;
      }

      if (selectedLaboratory !== 'all') {
        const labId = sub.laboratoryId || sub.laboratoire?.toLowerCase();
        if (labId !== selectedLaboratory) return false;
      }

      if (selectedStatus !== 'all') {
        const status = sub.status || sub.statut;
        if (selectedStatus === 'valide_publie') {
          if (status !== 'valide' && status !== 'publie') return false;
        } else if (status !== selectedStatus) {
          return false;
        }
      }

      if (selectedType !== 'all') {
        const type = sub.type_sujet || (sub.supervisorId ? 'officiel' : 'indicatif');
        if (type !== selectedType) return false;
      }

      return true;
    });
  }, [
    subjectsList,
    searchQuery,
    selectedProfessors,
    selectedDomain,
    selectedSpecialty,
    selectedEstablishment,
    selectedLaboratory,
    selectedStatus,
    selectedType,
  ]);

  const displayedSubjects = filteredSubjects.slice(0, visibleLimit);

  const getEstablishmentName = (id?: string) => {
    if (!id) return 'USMBA';
    return ESTABLISHMENTS.find((e) => e.id.toLowerCase() === id.toLowerCase())?.shortName || id.toUpperCase();
  };

  const getLaboratoryName = (id?: string) => {
    if (!id) return 'Laboratoire de rattachement';
    return LABORATORIES.find((l) => l.id.toLowerCase() === id.toLowerCase())?.name || id.toUpperCase();
  };

  const handleApply = (subjectId: string) => {
    const targetPath = `/candidat/postuler?subjectId=${subjectId}`;
    if (!currentUser) {
      sessionStorage.setItem('gcd_pending_redirect', targetPath);
      navigate(`/login?redirect=${encodeURIComponent(targetPath)}`);
      return;
    }

    if (!currentUser.roles.includes('candidat')) {
      setRoleNotice(
        'Vous êtes actuellement connecté avec un compte personnel administratif/enseignant. Connectez-vous avec votre compte Google candidat pour déposer une candidature.'
      );
      return;
    }

    if (currentRole !== 'candidat') {
      switchRoleQuick('candidat');
    }
    navigate(targetPath);
  };

  const toggleProfessorFilter = (profId: string) => {
    setSelectedProfessors((prev) =>
      prev.includes(profId) ? prev.filter((id) => id !== profId) : [...prev, profId]
    );
  };

  const removeProfessorFilter = (profId: string) => {
    setSelectedProfessors((prev) => prev.filter((id) => id !== profId));
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedDomain('all');
    setSelectedSpecialty('all');
    setSelectedEstablishment('all');
    setSelectedLaboratory('all');
    setSelectedStatus('all');
    setSelectedType('all');
    setSelectedProfessors([]);
    setProfessorSearchQuery('');
  };

  const hasActiveFilters =
    searchQuery !== '' ||
    selectedDomain !== 'all' ||
    selectedSpecialty !== 'all' ||
    selectedEstablishment !== 'all' ||
    selectedLaboratory !== 'all' ||
    selectedStatus !== 'all' ||
    selectedType !== 'all' ||
    selectedProfessors.length > 0;

  const canAssignProfessor =
    currentUser &&
    ['administration', 'enseignant_chercheur', 'responsable_labo', 'responsable_gcd'].includes(currentRole);

  const handleAssignProfessor = (subjectId: string, profId: string) => {
    if (!canAssignProfessor || !currentUser) return;
    const updated = storageService.assignProfessorToSubject(subjectId, profId, {
      id: currentUser.id,
      name: `${currentUser.firstName} ${currentUser.lastName}`,
      role: currentRole,
    });

    if (updated) {
      setSubjectsList(storageService.getSubjects());
      setSelectedSubject(updated);
      setAssignmentNotice(`Le sujet a été attribué avec succès à ${updated.supervisorName}.`);
      setTimeout(() => setAssignmentNotice(null), 5000);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      {!compactHeader ? (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 rounded-3xl p-8 sm:p-10 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          <div className="relative z-10 space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-teal-500/20 border border-teal-400/40 px-3.5 py-1 rounded-full text-teal-300 text-xs font-semibold backdrop-blur-xs">
              <BookOpen className="w-3.5 h-3.5" />
              Portail Officiel des Sujets de Doctorat USMBA • Session 2026-2027
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              Catalogue &amp; Filtrage Avancé des Sujets de Recherche
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Explorez librement plus de 100 thématiques doctorales réparties sur les 10 domaines scientifiques de l&apos;USMBA. Filtrez par professeur encadrant, laboratoire, établissement, spécialité ou statut avant de vous authentifier pour postuler.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-slate-300">
              <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-lg border border-white/10">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                Sujets officiels proposés par les enseignants
              </span>
              <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-lg border border-white/10">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Catalogue initial des thématiques indicatives
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full text-xs font-semibold">
              <BookOpen className="w-3.5 h-3.5 text-teal-600" />
              Catalogue Public des Sujets de Doctorat ({subjectsList.length})
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Explorez les Sujets de Thèse Disponibles
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-2xl">
              Consultez librement les sujets sans création de compte préalable. Cliquez sur « Postuler à ce sujet » lorsque vous êtes prêt à déposer votre candidature.
            </p>
          </div>
        </div>
      )}

      {roleNotice && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-900 flex items-center justify-between gap-3">
          <span>{roleNotice}</span>
          <button
            type="button"
            onClick={() => setRoleNotice(null)}
            className="text-amber-700 hover:text-amber-950 font-bold"
          >
            Fermer
          </button>
        </div>
      )}

      {/* FILTER PANEL */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base">
            <SlidersHorizontal className="w-5 h-5 text-teal-700" />
            <span>Filtres de Recherche Multicritères</span>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Réinitialiser tous les filtres
            </button>
          )}
        </div>

        {/* 1. Global Text Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par titre, mots-clés, problématique, résumé, ou nom du directeur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all text-slate-800 placeholder:text-slate-400 shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 2. Core Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* PROFESSOR FILTER (Dynamic, searchable, multi-select) */}
          <div className="relative" ref={profDropdownRef}>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-teal-700" />
                Professeur encadrant
              </span>
              {selectedProfessors.length > 0 && (
                <span className="bg-teal-100 text-teal-800 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
                  {selectedProfessors.length} sélectionné(s)
                </span>
              )}
            </label>

            <button
              type="button"
              onClick={() => setIsProfDropdownOpen((prev) => !prev)}
              className={`w-full bg-slate-50 border ${
                selectedProfessors.length > 0 ? 'border-teal-400 ring-1 ring-teal-300' : 'border-slate-200'
              } rounded-xl px-3 py-2.5 text-xs text-left text-slate-800 flex items-center justify-between hover:bg-slate-100 transition-colors`}
            >
              <span className="truncate">
                {selectedProfessors.length === 0
                  ? 'Tous les professeurs'
                  : `${selectedProfessors.length} professeur(s) filtré(s)`}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform ${
                  isProfDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isProfDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white rounded-2xl border border-slate-200 shadow-xl p-3 space-y-2 max-h-80 overflow-hidden flex flex-col">
                <div className="relative shrink-0">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Chercher nom, prénom..."
                    value={professorSearchQuery}
                    onChange={(e) => setProfessorSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                    autoFocus
                  />
                </div>

                <div className="border-b border-slate-100 pb-1.5 shrink-0">
                  <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-amber-50/60 cursor-pointer text-xs font-semibold text-amber-900">
                    <input
                      type="checkbox"
                      checked={selectedProfessors.includes('__unassigned__')}
                      onChange={() => toggleProfessorFilter('__unassigned__')}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Non attribué (Sujets indicatifs)</span>
                  </label>
                </div>

                <div className="overflow-y-auto space-y-1 pr-1 flex-1">
                  {filteredProfessors.map((prof) => {
                    const isChecked = selectedProfessors.includes(prof.id);
                    return (
                      <label
                        key={prof.id}
                        className={`flex items-center gap-2 p-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                          isChecked ? 'bg-teal-50 text-teal-950 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleProfessorFilter(prof.id)}
                          className="rounded text-teal-600 focus:ring-teal-500"
                        />
                        <div className="truncate flex-1">
                          <span className="block truncate">
                            Pr. {prof.firstName} {prof.lastName.toUpperCase()}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            {prof.establishmentId?.toUpperCase() || 'USMBA'}{' '}
                            {prof.laboratoryId ? `• ${prof.laboratoryId.toUpperCase()}` : ''}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                  {filteredProfessors.length === 0 && (
                    <div className="text-center py-4 text-xs text-slate-400">
                      Aucun professeur trouvé.
                    </div>
                  )}
                </div>

                {selectedProfessors.length > 0 && (
                  <div className="border-t border-slate-100 pt-2 shrink-0 flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">{selectedProfessors.length} sélectionné(s)</span>
                    <button
                      type="button"
                      onClick={() => setSelectedProfessors([])}
                      className="text-rose-600 hover:underline font-semibold"
                    >
                      Tout effacer
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* DOMAINE SCIENTIFIQUE */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-teal-700" />
              Domaine scientifique
            </label>
            <select
              value={selectedDomain}
              onChange={(e) => {
                setSelectedDomain(e.target.value);
                setSelectedSpecialty('all');
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
            >
              <option value="all">Tous les domaines</option>
              {SCIENTIFIC_DOMAINS.map((dom) => (
                <option key={dom} value={dom}>
                  {dom}
                </option>
              ))}
            </select>
          </div>

          {/* SPÉCIALITÉ */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-teal-700" />
              Spécialité
            </label>
            <select
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
            >
              <option value="all">Toutes les spécialités ({availableSpecialties.length})</option>
              {availableSpecialties.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
                </option>
              ))}
            </select>
          </div>

          {/* TYPE DE SUJET */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-teal-700" />
              Type de sujet
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as 'all' | 'officiel' | 'indicatif')}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
            >
              <option value="all">Tous types confondus</option>
              <option value="officiel">Sujets officiels (Enseignant)</option>
              <option value="indicatif">Sujets indicatifs (Catalogue)</option>
            </select>
          </div>
        </div>

        {/* 3. Secondary Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5 text-teal-700" />
              Établissement USMBA
            </label>
            <select
              value={selectedEstablishment}
              onChange={(e) => {
                setSelectedEstablishment(e.target.value);
                setSelectedLaboratory('all');
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
            >
              <option value="all">Tous les établissements</option>
              {ESTABLISHMENTS.map((est) => (
                <option key={est.id} value={est.id}>
                  {est.shortName} — {est.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-teal-700" />
              Laboratoire de recherche
            </label>
            <select
              value={selectedLaboratory}
              onChange={(e) => setSelectedLaboratory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
            >
              <option value="all">Tous les laboratoires</option>
              {LABORATORIES.filter(
                (l) => selectedEstablishment === 'all' || l.establishmentId === selectedEstablishment
              ).map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.code} — {lab.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
              Statut du sujet
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
            >
              <option value="all">Tous les statuts</option>
              <option value="valide_publie">Validé ou Publié</option>
              <option value="non_attribue">Non attribué (Indicatif)</option>
              <option value="en_attente_validation">En attente de visa laboratoire</option>
              <option value="correction_demandee">Correction demandée</option>
              <option value="archive">Archivé / Retiré</option>
            </select>
          </div>
        </div>

        {/* Selected Professors Chips */}
        {selectedProfessors.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500 font-semibold">Professeurs filtrés :</span>
            {selectedProfessors.map((pId) => {
              if (pId === '__unassigned__') {
                return (
                  <span
                    key={pId}
                    className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-full text-xs font-semibold"
                  >
                    <Sparkles className="w-3 h-3 text-amber-700" />
                    <span>Non attribué (Indicatifs)</span>
                    <button
                      type="button"
                      onClick={() => removeProfessorFilter(pId)}
                      className="hover:text-amber-950 p-0.5 rounded-full"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              }
              const p = professorsList.find((prof) => prof.id === pId);
              return (
                <span
                  key={pId}
                  className="inline-flex items-center gap-1 bg-teal-50 text-teal-900 border border-teal-200 px-2.5 py-1 rounded-full text-xs font-medium"
                >
                  <Users className="w-3 h-3 text-teal-600" />
                  <span>
                    Pr. {p?.firstName} {p?.lastName}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeProfessorFilter(pId)}
                    className="hover:text-teal-950 p-0.5 rounded-full"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              onClick={() => setSelectedProfessors([])}
              className="text-xs text-slate-500 hover:text-slate-800 underline ml-2"
            >
              Effacer la sélection
            </button>
          </div>
        )}

        {/* Active Results Summary Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-600 pt-3 border-t border-slate-100 gap-2">
          <div>
            Affichage de <strong className="text-slate-900 text-sm">{filteredSubjects.length}</strong> sujet(s) sur{' '}
            <strong className="text-slate-900">{subjectsList.length}</strong> disponible(s)
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {filteredSubjects.filter((s) => s.type_sujet === 'officiel').length} Officiel(s)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {filteredSubjects.filter((s) => s.type_sujet === 'indicatif').length} Indicatif(s)
            </span>
          </div>
        </div>
      </div>

      {/* SUBJECTS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {displayedSubjects.map((sub) => {
          const isOfficial = sub.type_sujet === 'officiel';
          const domain = sub.domaine || sub.discipline;
          const specialty = sub.specialite || sub.discipline;
          const supervisor = sub.supervisorName || sub.professeur_nom;
          const labName = getLaboratoryName(sub.laboratoryId || sub.laboratoire);
          const estName = getEstablishmentName(sub.establishmentId || sub.etablissement);
          const keywords = sub.keywords || sub.mots_cles || [];
          const status = sub.status || sub.statut;

          return (
            <div
              key={sub.id}
              className={`bg-white rounded-3xl border transition-all duration-200 flex flex-col justify-between p-6 sm:p-7 space-y-5 hover:shadow-lg ${
                isOfficial
                  ? 'border-slate-200 hover:border-teal-400'
                  : 'border-amber-200/80 hover:border-amber-400 bg-gradient-to-b from-white to-amber-50/15'
              }`}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {isOfficial ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Sujet officiel enseignant
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-100/90 border border-amber-300 px-2.5 py-0.5 rounded-full">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      Sujet indicatif (Catalogue)
                    </span>
                  )}

                  <StatusBadge status={status} />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-md">
                    {domain}
                  </span>
                  {specialty && specialty !== domain && (
                    <span className="font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                      {specialty}
                    </span>
                  )}
                  <span className="font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md ml-auto">
                    {estName}
                  </span>
                </div>

                <h3 className="font-bold text-base sm:text-lg text-slate-900 leading-snug line-clamp-2 hover:text-teal-900 transition-colors">
                  {sub.title || sub.titre}
                </h3>

                <div className="text-xs text-slate-600 space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400 shrink-0" />
                    {supervisor && supervisor !== 'Non attribué' ? (
                      <span className="font-bold text-slate-900">{supervisor}</span>
                    ) : (
                      <span className="text-amber-800 font-semibold italic">
                        Directeur de thèse : Non attribué (Sujet à adopter)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{labName}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                  {sub.problematique || sub.abstract || sub.description}
                </p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {keywords.slice(0, 5).map((kw, i) => (
                    <span
                      key={i}
                      className="text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200/60"
                    >
                      #{kw}
                    </span>
                  ))}
                  {keywords.length > 5 && (
                    <span className="text-[10px] text-slate-400 self-center font-medium">
                      +{keywords.length - 5}
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedSubject(sub)}
                  className="text-xs font-semibold text-teal-800 hover:text-teal-950 hover:underline inline-flex items-center gap-1.5 py-1"
                >
                  <FileText className="w-4 h-4" />
                  <span>Consulter la fiche complète</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleApply(sub.id)}
                  className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-colors shadow-xs"
                >
                  <span>Postuler à ce sujet</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {filteredSubjects.length === 0 && (
          <div className="col-span-1 md:col-span-2 text-center py-20 bg-white rounded-3xl border border-slate-200 p-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <BookOpen className="w-8 h-8" />
            </div>
            <h4 className="font-extrabold text-slate-900 text-base">
              Aucun sujet ne correspond à vos filtres actuels
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Essayez d&apos;élargir vos critères de recherche ou réinitialisez les filtres pour afficher tous les sujets disponibles.
            </p>
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-colors shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Réinitialiser tous les filtres
            </button>
          </div>
        )}
      </div>

      {/* Load more button when paginated */}
      {filteredSubjects.length > displayedSubjects.length && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleLimit((prev) => prev + 24)}
            className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 font-bold px-6 py-3 rounded-2xl text-xs shadow-xs transition-colors"
          >
            <span>
              Afficher plus de sujets ({filteredSubjects.length - displayedSubjects.length} restant(s))
            </span>
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* DETAILED MODAL VIEW */}
      {selectedSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl my-8 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 sm:p-7 bg-slate-900 text-white flex items-start justify-between gap-4 shrink-0">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {selectedSubject.type_sujet === 'officiel' ? (
                    <span className="text-xs font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-700 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" />
                      Sujet Officiel d&apos;Enseignant
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-amber-300 bg-amber-950/80 border border-amber-700 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      Sujet Indicatif du Catalogue Initial
                    </span>
                  )}
                  <span className="text-xs font-semibold text-teal-300 bg-teal-900/80 border border-teal-700 px-2.5 py-0.5 rounded-full">
                    {selectedSubject.domaine || selectedSubject.discipline}
                  </span>
                  <StatusBadge status={selectedSubject.status || selectedSubject.statut} />
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold leading-tight">
                  {selectedSubject.title || selectedSubject.titre}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubject(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto space-y-6 text-xs text-slate-700 leading-relaxed">
              {assignmentNotice && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="font-semibold">{assignmentNotice}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-400 font-semibold block text-[11px]">Établissement</span>
                  <span className="font-bold text-slate-900">
                    {getEstablishmentName(selectedSubject.establishmentId || selectedSubject.etablissement)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[11px]">Laboratoire</span>
                  <span className="font-bold text-slate-900 truncate block">
                    {getLaboratoryName(selectedSubject.laboratoryId || selectedSubject.laboratoire)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[11px]">Directeur de Thèse</span>
                  <span className="font-bold text-slate-900">
                    {selectedSubject.supervisorName || selectedSubject.professeur_nom || 'Non attribué'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[11px]">Spécialité</span>
                  <span className="font-bold text-teal-800">
                    {selectedSubject.specialite || selectedSubject.discipline}
                  </span>
                </div>
              </div>

              {selectedSubject.problematique && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <HelpCircle className="w-4 h-4 text-teal-700" />
                    <span>Problématique Scientifique</span>
                  </div>
                  <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-2xl text-teal-950 font-medium leading-relaxed">
                    {selectedSubject.problematique}
                  </div>
                </div>
              )}

              {selectedSubject.objectives && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4 text-teal-700" />
                    <span>Objectifs de la Recherche</span>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-800 leading-relaxed whitespace-pre-line">
                    {selectedSubject.objectives}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <FileText className="w-4 h-4 text-teal-700" />
                  <span>Description Complète &amp; Contexte</span>
                </div>
                <p className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-700 leading-relaxed">
                  {selectedSubject.abstract || selectedSubject.description}
                </p>
              </div>

              {selectedSubject.prerequisites && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <GraduationCap className="w-4 h-4 text-amber-700" />
                    <span>Profil Recherché, Compétences &amp; Prérequis</span>
                  </div>
                  <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200 text-amber-950 leading-relaxed">
                    {selectedSubject.prerequisites}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <span className="text-slate-900 font-bold text-xs block">Mots-clés scientifiques</span>
                <div className="flex flex-wrap gap-2">
                  {(selectedSubject.keywords || selectedSubject.mots_cles || []).map((kw, idx) => (
                    <span
                      key={idx}
                      className="text-xs bg-slate-100 text-slate-800 font-medium px-3 py-1 rounded-lg border border-slate-200"
                    >
                      #{kw}
                    </span>
                  ))}
                </div>
              </div>

              {/* Staff-only professor attribution control */}
              {canAssignProfessor &&
                (!selectedSubject.supervisorId || selectedSubject.supervisorId === 'null') && (
                  <div className="p-5 bg-gradient-to-r from-teal-50 to-blue-50 rounded-2xl border border-teal-200 space-y-3">
                    <div className="flex items-center gap-2 text-teal-950 font-bold text-sm">
                      <BookmarkPlus className="w-4 h-4 text-teal-700" />
                      <span>Attribution du Sujet Indicatif à un Enseignant-Chercheur</span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                      <select
                        value={assigningProfId}
                        onChange={(e) => setAssigningProfId(e.target.value)}
                        className="bg-white border border-teal-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 flex-1"
                      >
                        <option value="">Sélectionner un professeur enregistré...</option>
                        {professorsList.map((prof) => (
                          <option key={prof.id} value={prof.id}>
                            Pr. {prof.firstName} {prof.lastName.toUpperCase()} (
                            {prof.establishmentId?.toUpperCase() || 'USMBA'})
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        disabled={!assigningProfId}
                        onClick={() => handleAssignProfessor(selectedSubject.id, assigningProfId)}
                        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shrink-0 flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Attribuer au Professeur</span>
                      </button>
                    </div>
                  </div>
                )}
            </div>

            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedSubject(null)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Fermer la vue
              </button>

              <button
                type="button"
                onClick={() => {
                  const subId = selectedSubject.id;
                  setSelectedSubject(null);
                  handleApply(subId);
                }}
                className="bg-teal-700 hover:bg-teal-800 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-2 shadow-xs"
              >
                <span>
                  {currentUser
                    ? 'Choisir ce sujet et déposer ma candidature'
                    : 'Se connecter et postuler à ce sujet'}
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
