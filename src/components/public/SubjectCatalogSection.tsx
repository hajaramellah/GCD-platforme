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
  BookmarkPlus,
  CheckSquare,
  Square,
  ListChecks,
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { ESTABLISHMENTS, LABORATORIES } from '../../data/seedData';
import { DoctoralSubject, User } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge } from '../common/StatusBadge';
import { getRequiredDocumentsForSubject } from '../../utils/documentRequirements';

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

const SELECTED_SUBJECTS_STORAGE_KEY = 'gcd_selected_subject_ids';

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

  const [subjectsList, setSubjectsList] = useState<DoctoralSubject[]>(() =>
    storageService.getSubjects()
  );
  const [professorsList] = useState<User[]>(() => storageService.getProfessors());

  // Existing applications for logged-in candidate (to prevent duplicate submissions)
  const existingCandidateSubjectIds = useMemo(() => {
    if (!currentUser || !currentUser.roles.includes('candidat')) return new Set<string>();
    const apps = storageService.getCandidateApplicationsStrict(
      currentUser.id,
      currentUser.email,
      currentUser.cin
    );
    return new Set(apps.map((a) => a.subjectId));
  }, [currentUser?.id, currentUser?.email, currentUser?.cin, currentUser?.roles]);

  // Multi-subject selection state (persisted in sessionStorage across login/register redirects)
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>(() => {
    try {
      const raw = sessionStorage.getItem(SELECTED_SUBJECTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((id) => typeof id === 'string');
      }
    } catch {
      // Ignore malformed sessionStorage
    }
    return [];
  });

  useEffect(() => {
    // Strip already-applied subjects if a candidate just logged in
    setSelectedSubjectIds((prev) => {
      const filtered = prev.filter((id) => !existingCandidateSubjectIds.has(id));
      if (filtered.length !== prev.length) {
        sessionStorage.setItem(SELECTED_SUBJECTS_STORAGE_KEY, JSON.stringify(filtered));
      }
      return filtered;
    });
  }, [existingCandidateSubjectIds]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SELECTED_SUBJECTS_STORAGE_KEY, JSON.stringify(selectedSubjectIds));
    } catch {
      // Ignore quota errors
    }
  }, [selectedSubjectIds]);

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

  // Modals & notices
  const [detailSubject, setDetailSubject] = useState<DoctoralSubject | null>(null);
  const [showConfirmSelectionModal, setShowConfirmSelectionModal] = useState(false);
  const [assigningProfId, setAssigningProfId] = useState<string>('');
  const [assignmentNotice, setAssignmentNotice] = useState<string | null>(null);
  const [roleNotice, setRoleNotice] = useState<string | null>(null);

  // Pagination
  const [visibleLimit, setVisibleLimit] = useState<number>(compactHeader ? 18 : 120);

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
      .filter(
        (s) =>
          selectedDomain === 'all' || s.domaine === selectedDomain || s.discipline === selectedDomain
      )
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
        const kwMatch = (sub.keywords || sub.mots_cles || []).some((k) =>
          k.toLowerCase().includes(q)
        );
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

  const selectedSubjectObjects = useMemo(
    () =>
      selectedSubjectIds
        .map((id) => subjectsList.find((s) => s.id === id))
        .filter((s): s is DoctoralSubject => Boolean(s)),
    [selectedSubjectIds, subjectsList]
  );

  const getEstablishmentName = (id?: string) => {
    if (!id) return 'USMBA';
    return (
      ESTABLISHMENTS.find((e) => e.id.toLowerCase() === id.toLowerCase())?.shortName ||
      id.toUpperCase()
    );
  };

  const getLaboratoryName = (id?: string) => {
    if (!id) return 'Laboratoire de rattachement';
    return (
      LABORATORIES.find((l) => l.id.toLowerCase() === id.toLowerCase())?.name || id.toUpperCase()
    );
  };

  const isSubjectSelectable = (sub: DoctoralSubject): boolean => {
    const status = sub.status || sub.statut;
    if (status === 'archive' || status === 'rejete') return false;
    if (existingCandidateSubjectIds.has(sub.id)) return false;
    return true;
  };

  const toggleSubjectSelection = (subjectId: string) => {
    const sub = subjectsList.find((s) => s.id === subjectId);
    if (!sub || !isSubjectSelectable(sub)) return;
    setSelectedSubjectIds((prev) =>
      prev.includes(subjectId) ? prev.filter((id) => id !== subjectId) : [...prev, subjectId]
    );
  };

  const proceedToApplyIds = (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids)).filter((id) => !existingCandidateSubjectIds.has(id));
    if (uniqueIds.length === 0) return;

    const targetPath = `/candidat/postuler?subjectIds=${encodeURIComponent(uniqueIds.join(','))}`;

    if (!currentUser) {
      sessionStorage.setItem(SELECTED_SUBJECTS_STORAGE_KEY, JSON.stringify(uniqueIds));
      sessionStorage.setItem('gcd_pending_redirect', targetPath);
      navigate(`/login?redirect=${encodeURIComponent(targetPath)}`);
      return;
    }

    if (!currentUser.roles.includes('candidat')) {
      setRoleNotice(
        'Vous êtes actuellement connecté avec un compte enseignant ou administratif. Basculez vers un profil candidat depuis Connexion pour déposer des candidatures.'
      );
      return;
    }

    if (currentRole !== 'candidat') {
      switchRoleQuick('candidat');
    }
    navigate(targetPath);
  };

  const handleOpenMultiConfirm = () => {
    if (selectedSubjectIds.length === 0) return;
    if (currentUser && !currentUser.roles.includes('candidat')) {
      setRoleNotice(
        'Vous êtes actuellement connecté avec un compte enseignant ou administratif. Basculez vers un profil candidat depuis Connexion pour déposer des candidatures.'
      );
      return;
    }
    setShowConfirmSelectionModal(true);
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
    ['administration', 'enseignant_chercheur', 'responsable_labo', 'responsable_gcd'].includes(
      currentRole
    );

  const handleAssignProfessor = (subjectId: string, profId: string) => {
    if (!canAssignProfessor || !currentUser) return;
    const updated = storageService.assignProfessorToSubject(subjectId, profId, {
      id: currentUser.id,
      name: `${currentUser.firstName} ${currentUser.lastName}`,
      role: currentRole,
    });

    if (updated) {
      setSubjectsList(storageService.getSubjects());
      setDetailSubject(updated);
      setAssignmentNotice(`Le sujet a été attribué avec succès à ${updated.supervisorName}.`);
      setTimeout(() => setAssignmentNotice(null), 5000);
    }
  };

  return (
    <div className="space-y-5">
      {/* Standalone Header when rendered on /sujets */}
      {!compactHeader && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-2">
          <div className="inline-flex items-center gap-2 text-teal-800 bg-teal-50 border border-teal-200 px-3 py-0.5 rounded-full text-xs font-semibold">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Catalogue des Sujets de Doctorat • Session 2026-2027</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Catalogue &amp; Candidature Multi-Sujets
          </h1>
          <p className="text-xs text-slate-600 max-w-2xl">
            Filtrez les thématiques doctorales, cochez plusieurs sujets si vous souhaitez postuler simultanément, ou cliquez sur « Plus de détails » pour ouvrir la fiche complète.
          </p>
        </div>
      )}

      {roleNotice && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-3">
          <span>{roleNotice}</span>
          <button
            type="button"
            onClick={() => setRoleNotice(null)}
            className="text-amber-700 hover:text-amber-950 font-bold shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {/* FILTER PANEL */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <SlidersHorizontal className="w-4 h-4 text-teal-700" />
            <span>Filtres de recherche ({filteredSubjects.length} / {subjectsList.length} sujets)</span>
          </div>
          <div className="flex items-center gap-3">
            {selectedSubjectIds.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-900 bg-teal-50 border border-teal-300 px-2.5 py-1 rounded-lg">
                <ListChecks className="w-3.5 h-3.5 text-teal-700" />
                {selectedSubjectIds.length} sujet(s) sélectionné(s)
              </span>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Réinitialiser</span>
              </button>
            )}
          </div>
        </div>

        {/* 1. Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par titre, mots-clés, spécialité ou nom du directeur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all text-slate-800 placeholder:text-slate-400"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* PROFESSOR FILTER */}
          <div className="relative" ref={profDropdownRef}>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-teal-700" />
                Directeur / Encadrant
              </span>
              {selectedProfessors.length > 0 && (
                <span className="text-[10px] font-bold text-teal-700">
                  {selectedProfessors.length} sélectionné(s)
                </span>
              )}
            </label>

            <button
              type="button"
              onClick={() => setIsProfDropdownOpen((prev) => !prev)}
              className={`w-full bg-slate-50 border ${
                selectedProfessors.length > 0 ? 'border-teal-400 ring-1 ring-teal-300' : 'border-slate-200'
              } rounded-xl px-3 py-2 text-xs text-left text-slate-800 flex items-center justify-between hover:bg-slate-100 transition-colors`}
            >
              <span className="truncate">
                {selectedProfessors.length === 0
                  ? 'Tous les directeurs'
                  : `${selectedProfessors.length} directeur(s)`}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform ${
                  isProfDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isProfDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white rounded-2xl border border-slate-200 shadow-xl p-3 space-y-2 max-h-72 overflow-hidden flex flex-col">
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
                            {prof.establishmentId?.toUpperCase() || 'USMBA'}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* DOMAINE */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-teal-700" />
              Domaine scientifique
            </label>
            <select
              value={selectedDomain}
              onChange={(e) => {
                setSelectedDomain(e.target.value);
                setSelectedSpecialty('all');
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
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
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-teal-700" />
              Spécialité
            </label>
            <select
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
            >
              <option value="all">Toutes les spécialités ({availableSpecialties.length})</option>
              {availableSpecialties.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
                </option>
              ))}
            </select>
          </div>

          {/* TYPE */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-teal-700" />
              Type de sujet
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as 'all' | 'officiel' | 'indicatif')}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
            >
              <option value="all">Tous types confondus</option>
              <option value="officiel">Sujets officiels</option>
              <option value="indicatif">Sujets indicatifs</option>
            </select>
          </div>
        </div>

        {/* 3. Secondary Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5 text-teal-700" />
              Établissement
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
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-teal-700" />
              Laboratoire
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
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
              Statut
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
            >
              <option value="all">Tous les statuts</option>
              <option value="valide_publie">Validé ou Publié</option>
              <option value="non_attribue">Non attribué</option>
              <option value="en_attente_validation">En attente validation</option>
              <option value="correction_demandee">Correction demandée</option>
              <option value="archive">Archivé</option>
            </select>
          </div>
        </div>

        {/* Active Professor Filter Chips */}
        {selectedProfessors.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-500 font-semibold">Encadrants filtrés :</span>
            {selectedProfessors.map((pId) => {
              const label =
                pId === '__unassigned__'
                  ? 'Non attribué'
                  : (() => {
                      const p = professorsList.find((prof) => prof.id === pId);
                      return p ? `Pr. ${p.firstName} ${p.lastName}` : pId;
                    })();
              return (
                <span
                  key={pId}
                  className="inline-flex items-center gap-1 bg-teal-50 text-teal-900 border border-teal-200 px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                >
                  <span>{label}</span>
                  <button
                    type="button"
                    onClick={() => removeProfessorFilter(pId)}
                    className="hover:text-teal-950 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* MULTI-SUBJECT SELECTION BAR (Sticky when >= 1 subject selected) */}
      {selectedSubjectIds.length > 0 && (
        <div className="sticky top-20 z-30 bg-slate-900 text-white rounded-2xl px-4 py-3 sm:px-5 shadow-lg border border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-teal-500 text-slate-950 font-black text-sm flex items-center justify-center shrink-0">
              {selectedSubjectIds.length}
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold">
                {selectedSubjectIds.length} sujet(s) sélectionné(s)
              </div>
              <div className="text-[11px] text-slate-300 truncate">
                1 candidature indépendante par sujet avec réutilisation de votre dossier commun.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedSubjectIds([])}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              Tout désélectionner
            </button>
            <button
              type="button"
              onClick={handleOpenMultiConfirm}
              className="inline-flex items-center gap-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 px-4 py-2 rounded-xl font-extrabold text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Postuler aux sujets sélectionnés</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* COMPACT VERTICAL LIST OF SUBJECTS */}
      <div className="space-y-2.5">
        {displayedSubjects.map((sub) => {
          const domain = sub.domaine || sub.discipline;
          const specialty = sub.specialite || sub.discipline;
          const supervisor = sub.supervisorName || sub.professeur_nom;
          const hasDirector = Boolean(supervisor && supervisor !== 'Non attribué');
          const labName = getLaboratoryName(sub.laboratoryId || sub.laboratoire);
          const estName = getEstablishmentName(sub.establishmentId || sub.etablissement);
          const status = sub.status || sub.statut;
          const alreadyApplied = existingCandidateSubjectIds.has(sub.id);
          const selectable = isSubjectSelectable(sub);
          const isChecked = selectedSubjectIds.includes(sub.id);

          return (
            <div
              key={sub.id}
              className={`bg-white rounded-2xl border transition-all px-4 py-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isChecked
                  ? 'border-teal-500 ring-1 ring-teal-300 bg-teal-50/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                {/* Selection Checkbox */}
                <button
                  type="button"
                  disabled={!selectable}
                  onClick={() => toggleSubjectSelection(sub.id)}
                  aria-label={`Sélectionner le sujet ${sub.title || sub.titre}`}
                  title={
                    alreadyApplied
                      ? 'Vous avez déjà une candidature pour ce sujet'
                      : !selectable
                      ? 'Sujet non ouvert à la candidature'
                      : isChecked
                      ? 'Retirer de la sélection'
                      : 'Sélectionner ce sujet pour postuler'
                  }
                  className={`mt-0.5 shrink-0 rounded-lg p-1 transition-colors ${
                    !selectable
                      ? 'text-slate-300 cursor-not-allowed'
                      : isChecked
                      ? 'text-teal-700 hover:bg-teal-100 cursor-pointer'
                      : 'text-slate-400 hover:text-teal-700 hover:bg-slate-100 cursor-pointer'
                  }`}
                >
                  {isChecked ? (
                    <CheckSquare className="w-5 h-5" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>

                {/* Essential Subject Info ONLY */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      onClick={() => setDetailSubject(sub)}
                      className="font-bold text-sm text-slate-900 hover:text-teal-800 cursor-pointer leading-snug"
                    >
                      {sub.title || sub.titre}
                    </h3>
                    {alreadyApplied && (
                      <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                        Déjà postulé
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span className="font-semibold text-teal-800">{domain}</span>
                    {specialty && specialty !== domain && (
                      <span className="text-slate-500">• {specialty}</span>
                    )}
                    <span className="font-semibold text-slate-700">• {estName}</span>
                    <span className="truncate max-w-xs sm:max-w-sm text-slate-500">• {labName}</span>
                    {hasDirector && (
                      <span className="font-medium text-slate-800">• Dir. : {supervisor}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right column: Status + More Details button */}
              <div className="flex items-center justify-between sm:justify-end gap-3 pl-9 sm:pl-0 shrink-0">
                <StatusBadge status={status} size="sm" />

                <button
                  type="button"
                  onClick={() => setDetailSubject(sub)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-teal-700" />
                  <span>Plus de détails</span>
                </button>
              </div>
            </div>
          );
        })}

        {filteredSubjects.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <BookOpen className="w-6 h-6" />
            </div>
            <h4 className="font-extrabold text-slate-900 text-sm">
              Aucun sujet ne correspond à vos filtres actuels
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Modifiez ou réinitialisez les filtres pour afficher l&apos;ensemble des sujets disponibles.
            </p>
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Réinitialiser les filtres</span>
            </button>
          </div>
        )}
      </div>

      {/* Pagination */}
      {filteredSubjects.length > displayedSubjects.length && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleLimit((prev) => prev + 24)}
            className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 font-bold px-5 py-2.5 rounded-xl text-xs shadow-2xs transition-colors cursor-pointer"
          >
            <span>
              Afficher plus de sujets ({filteredSubjects.length - displayedSubjects.length} restant(s))
            </span>
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MULTI-SUBJECT SELECTION CONFIRMATION MODAL */}
      {showConfirmSelectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-6">
            <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h3 className="text-base font-extrabold">
                  Confirmer votre sélection ({selectedSubjectObjects.length} sujet(s))
                </h3>
                <p className="text-[11px] text-slate-300">
                  Une candidature indépendante sera préparée pour chaque sujet, avec réutilisation de votre dossier personnel.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmSelectionModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
              {selectedSubjectObjects.map((sub, idx) => (
                <div
                  key={sub.id}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-start justify-between gap-3"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-[11px] font-bold text-teal-800">
                      Sujet #{idx + 1} • {getEstablishmentName(sub.establishmentId || sub.etablissement)}
                    </div>
                    <div className="text-xs font-bold text-slate-900">
                      {sub.title || sub.titre}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {sub.domaine || sub.discipline} • {getLaboratoryName(sub.laboratoryId || sub.laboratoire)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = selectedSubjectIds.filter((id) => id !== sub.id);
                      setSelectedSubjectIds(next);
                      if (next.length === 0) setShowConfirmSelectionModal(false);
                    }}
                    className="text-xs font-semibold text-rose-600 hover:underline shrink-0"
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmSelectionModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Modifier la sélection
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmSelectionModal(false);
                  proceedToApplyIds(selectedSubjectIds);
                }}
                className="inline-flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                <span>
                  {currentUser
                    ? 'Continuer vers le formulaire de candidature'
                    : 'Se connecter / créer un compte et postuler'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED MODAL VIEW ("Plus de détails") */}
      {detailSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl my-8 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 sm:p-7 bg-slate-900 text-white flex items-start justify-between gap-4 shrink-0">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {detailSubject.type_sujet === 'officiel' ? (
                    <span className="text-xs font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-700 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" />
                      Sujet Officiel d&apos;Enseignant
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-amber-300 bg-amber-950/80 border border-amber-700 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      Sujet Indicatif du Catalogue
                    </span>
                  )}
                  <span className="text-xs font-semibold text-teal-300 bg-teal-900/80 border border-teal-700 px-2.5 py-0.5 rounded-full">
                    {detailSubject.domaine || detailSubject.discipline}
                  </span>
                  <StatusBadge status={detailSubject.status || detailSubject.statut} />
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold leading-tight">
                  {detailSubject.title || detailSubject.titre}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDetailSubject(null)}
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
                    {getEstablishmentName(detailSubject.establishmentId || detailSubject.etablissement)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[11px]">Laboratoire</span>
                  <span className="font-bold text-slate-900 block">
                    {getLaboratoryName(detailSubject.laboratoryId || detailSubject.laboratoire)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[11px]">Directeur de Thèse</span>
                  <span className="font-bold text-slate-900">
                    {detailSubject.supervisorName || detailSubject.professeur_nom || 'Non attribué'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[11px]">Spécialité</span>
                  <span className="font-bold text-teal-800">
                    {detailSubject.specialite || detailSubject.discipline}
                  </span>
                </div>
              </div>

              {detailSubject.problematique && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <HelpCircle className="w-4 h-4 text-teal-700" />
                    <span>Problématique Scientifique</span>
                  </div>
                  <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-2xl text-teal-950 font-medium leading-relaxed">
                    {detailSubject.problematique}
                  </div>
                </div>
              )}

              {detailSubject.objectives && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4 text-teal-700" />
                    <span>Objectifs de la Recherche</span>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-800 leading-relaxed whitespace-pre-line">
                    {detailSubject.objectives}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <FileText className="w-4 h-4 text-teal-700" />
                  <span>Description Complète &amp; Contexte</span>
                </div>
                <p className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-700 leading-relaxed">
                  {detailSubject.abstract || detailSubject.description}
                </p>
              </div>

              {detailSubject.prerequisites && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <GraduationCap className="w-4 h-4 text-amber-700" />
                    <span>Profil Recherché, Compétences &amp; Prérequis</span>
                  </div>
                  <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200 text-amber-950 leading-relaxed">
                    {detailSubject.prerequisites}
                  </div>
                </div>
              )}

              {/* Required documents preview */}
              <div className="space-y-2">
                <span className="text-slate-900 font-bold text-xs block">
                  Pièces requises pour ce sujet
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {getRequiredDocumentsForSubject(detailSubject).map((spec) => (
                    <div
                      key={spec.type}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2"
                    >
                      <span className="text-[11px] font-medium text-slate-800 truncate">
                        {spec.label}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          spec.category === 'specifique_sujet'
                            ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                            : 'bg-teal-50 text-teal-800 border border-teal-200'
                        }`}
                      >
                        {spec.category === 'specifique_sujet' ? 'Spécifique sujet' : 'Commune'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-slate-900 font-bold text-xs block">Mots-clés scientifiques</span>
                <div className="flex flex-wrap gap-2">
                  {(detailSubject.keywords || detailSubject.mots_cles || []).map((kw, idx) => (
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
                (!detailSubject.supervisorId || detailSubject.supervisorId === 'null') && (
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
                        onClick={() => handleAssignProfessor(detailSubject.id, assigningProfId)}
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
                onClick={() => setDetailSubject(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Fermer
              </button>

              <div className="flex flex-wrap items-center gap-2.5">
                {isSubjectSelectable(detailSubject) && (
                  <button
                    type="button"
                    onClick={() => toggleSubjectSelection(detailSubject.id)}
                    className={`px-4 py-2 rounded-xl font-bold text-xs border transition-colors cursor-pointer ${
                      selectedSubjectIds.includes(detailSubject.id)
                        ? 'bg-teal-50 border-teal-400 text-teal-900'
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {selectedSubjectIds.includes(detailSubject.id)
                      ? '✓ Dans ma sélection'
                      : '+ Ajouter à ma sélection'}
                  </button>
                )}

                {!existingCandidateSubjectIds.has(detailSubject.id) &&
                  isSubjectSelectable(detailSubject) && (
                    <button
                      type="button"
                      onClick={() => {
                        const subId = detailSubject.id;
                        setDetailSubject(null);
                        proceedToApplyIds([subId]);
                      }}
                      className="bg-teal-700 hover:bg-teal-800 text-white px-5 py-2 rounded-xl font-bold text-xs transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
                    >
                      <span>Postuler directement à ce sujet</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
