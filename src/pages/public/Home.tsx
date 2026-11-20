import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, FlaskConical, ShieldCheck, ArrowRight, UserPlus } from 'lucide-react';
import { SubjectCatalogSection } from '../../components/public/SubjectCatalogSection';
import { useAuth } from '../../context/AuthContext';

export const Home: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <div className="space-y-10 pb-16 pt-6">
      {/* Compact Top Intro + Direct Catalog Access */}
      <section id="catalogue-sujets" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 sm:px-6 sm:py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                <BookOpen className="w-3.5 h-3.5 text-teal-700" />
                Catalogue des Sujets de Doctorat
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                <FlaskConical className="w-3 h-3 text-slate-500" />
                Mode démonstration académique
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Sujets de Thèse Ouverts — Sélection &amp; Candidatures Multiples
            </h1>
            <p className="text-xs text-slate-600">
              Cochez un ou plusieurs sujets pour déposer vos candidatures simultanément, ou cliquez sur « Plus de détails » pour consulter la fiche complète.
            </p>
          </div>

          {!currentUser && (
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-bold text-xs transition-colors whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-teal-300" />
                <span>Connexion</span>
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 px-4 py-2 rounded-xl font-bold text-xs transition-colors whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5 text-teal-700" />
                <span>Créer un compte</span>
              </Link>
            </div>
          )}
        </div>

        <SubjectCatalogSection compactHeader={true} defaultStatusFilter="all" />
      </section>

      {/* Concise 4-Step Academic Workflow Overview (Below Catalog) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-t border-slate-200 pt-8">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Parcours de candidature &amp; suivi doctoral simulé
            </h2>
            <p className="text-xs text-slate-500">
              Toutes les données, pièces justificatives et intégrations administratives de cette plateforme sont fictives à des fins de démonstration académique.
            </p>
          </div>
          <Link
            to="/faq-aide"
            className="text-xs font-bold text-teal-700 hover:underline inline-flex items-center gap-1 shrink-0"
          >
            <span>Consulter la FAQ &amp; règles</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="text-xs font-extrabold text-teal-800">1. Sélection multi-sujets</div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Sélectionnez un ou plusieurs sujets dans le catalogue et créez des dossiers indépendants en une seule démarche.
            </p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="text-xs font-extrabold text-teal-800">2. Dossier personnel centralisé</div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Vos pièces communes (CIN, diplômes, relevés, CV) sont mutualisées automatiquement et complétées une seule fois.
            </p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="text-xs font-extrabold text-teal-800">3. Instruction &amp; Entretiens</div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Suivi des dossiers complets, incomplets ou à corriger avec motifs détaillés, convocations et évaluations de jury.
            </p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="text-xs font-extrabold text-teal-800">4. Admission &amp; Réinscription</div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Publication des résultats, checklist d&apos;inscription administrative et suivi des 200h de formation doctorale.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
