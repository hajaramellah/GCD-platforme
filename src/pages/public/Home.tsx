import React from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Scan,
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { ESTABLISHMENTS, LABORATORIES } from '../../data/seedData';
import { SubjectCatalogSection } from '../../components/public/SubjectCatalogSection';
import { useAuth } from '../../context/AuthContext';

export const Home: React.FC = () => {
  const { currentUser } = useAuth();
  const subjects = storageService.getSubjects();
  const validatedSubjectsCount = subjects.filter((s) => s.status === 'valide' || s.status === 'publie').length;
  const activeCampaign = storageService.getActiveCampaign();

  return (
    <div className="space-y-16 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-teal-950 text-white py-16 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#2dd4bf_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="max-w-7xl mx-auto relative z-10 space-y-8 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 bg-teal-500/10 border border-teal-400/30 px-3.5 py-1.5 rounded-full text-teal-300 text-xs font-semibold">
            <Sparkles className="w-4 h-4 text-teal-400" />
            Campagne Doctorale 2026-2027 • Université Sidi Mohamed Ben Abdellah
          </div>

          <div className="max-w-3xl space-y-4">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.15]">
              Plateforme de Gestion du{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-300">
                Cycle Doctoral
              </span>
            </h1>
            <p className="text-slate-300 text-lg sm:text-xl font-normal leading-relaxed">
              Le portail officiel du Centre d&apos;Études Doctorales (CEDoc) de l&apos;USMBA : consultez librement les sujets de recherche ouverts, créez votre compte selon votre méthode préférée et suivez vos candidatures en toute transparence.
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-2">
            <a
              href="#catalogue-sujets"
              className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-950 px-6 py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-teal-500/20"
            >
              <Search className="w-4 h-4 text-slate-950" />
              <span>Explorer les sujets ({subjects.length})</span>
            </a>

            {!currentUser && (
              <>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-3.5 rounded-xl font-bold text-sm transition-all backdrop-blur-xs"
                >
                  <Scan className="w-4 h-4 text-teal-300" />
                  <span>Créer un compte candidat</span>
                </Link>

                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 bg-slate-800/80 hover:bg-slate-700 text-teal-300 border border-teal-500/30 px-5 py-3.5 rounded-xl font-semibold text-sm transition-all"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Connexion Google</span>
                </Link>
              </>
            )}
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-8 border-t border-slate-700/60 max-w-4xl text-left">
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-xs">
              <div className="text-3xl font-extrabold text-teal-400">{validatedSubjectsCount}</div>
              <div className="text-xs text-slate-300 font-medium mt-1">Sujets Validés &amp; Ouverts</div>
            </div>
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-xs">
              <div className="text-3xl font-extrabold text-teal-400">{ESTABLISHMENTS.length}</div>
              <div className="text-xs text-slate-300 font-medium mt-1">Établissements Rattachés</div>
            </div>
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-xs">
              <div className="text-3xl font-extrabold text-teal-400">{LABORATORIES.length}</div>
              <div className="text-xs text-slate-300 font-medium mt-1">Laboratoires Accrédités</div>
            </div>
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-xs">
              <div className="text-3xl font-extrabold text-teal-400">
                {activeCampaign ? activeCampaign.totalQuota : 240}
              </div>
              <div className="text-xs text-slate-300 font-medium mt-1">Places Disponibles 2026</div>
            </div>
          </div>
        </div>
      </section>

      {/* Public Subject Catalog Directly Accessible on Home Page */}
      <section id="catalogue-sujets" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SubjectCatalogSection compactHeader={true} defaultStatusFilter="all" />
      </section>

      {/* 4 Process Pillars */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Les Piliers du Cycle Doctoral USMBA
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            Une architecture transparente assurant rigueur scientifique, équité de sélection et conformité académique.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center font-bold">
              1
            </div>
            <h3 className="font-bold text-sm text-slate-900">Enrôlement &amp; Candidature</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Choix libre : scan caméra de la CIN/carte d&apos;étudiant, importation de fichiers (JPG, PNG, PDF) ou saisie manuelle. Postulez à un ou plusieurs sujets en toute simplicité.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
              2
            </div>
            <h3 className="font-bold text-sm text-slate-900">Instruction &amp; Sélection</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Contrôle de recevabilité par les scolarités, traçabilité des pièces, convocations officielles d&apos;entretien et évaluation collégiale par les jurys.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold">
              3
            </div>
            <h3 className="font-bold text-sm text-slate-900">Résultats &amp; Inscription</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Publication certifiée des procès-verbaux, liste principale et liste d&apos;attente, checklist personnalisée et signature de la Charte des Thèses.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold">
              4
            </div>
            <h3 className="font-bold text-sm text-slate-900">Suivi Doctoral &amp; Thèse</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Campagne annuelle de réinscription, validation des modules de formation (200h), avis motivé de la direction de thèse et préparation de la soutenance.
            </p>
          </div>
        </div>
      </section>

      {/* Guide for Candidates */}
      {!currentUser && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-teal-900 to-slate-900 rounded-3xl p-8 sm:p-12 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-4 max-w-xl">
              <div className="inline-flex items-center gap-1.5 text-teal-300 bg-teal-500/20 px-3 py-1 rounded-full text-xs font-semibold">
                <Scan className="w-4 h-4" />
                Enrôlement flexible pour tous les candidats
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Créez votre compte candidat à votre rythme
              </h2>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                Scannez vos cartes avec la caméra, importez vos fichiers (JPG, PNG, PDF) ou remplissez le formulaire manuellement selon vos besoins. Vous gardez toujours le contrôle total avant validation.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0">
              <Link
                to="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold px-7 py-4 rounded-2xl text-xs transition-all shadow-lg shadow-teal-500/25"
              >
                <span>Créer mon compte candidat</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
