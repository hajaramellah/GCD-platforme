import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FlaskConical,
  UserCheck,
  ArrowLeft,
  Info,
  GraduationCap,
  Briefcase,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { User, UserRole } from '../../types';
import { getDashboardByRole } from '../../components/layout/Navbar';

interface DevDemoAccount {
  id: string;
  category?: 'candidat_scenario' | 'staff_profile';
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  spaceLabel: string;
  profileLabel: string;
  description: string;
  studentOriginType: string | null;
}

export const DevDemoProfiles: React.FC = () => {
  const navigate = useNavigate();
  const { loginWithUser, refreshUserData } = useAuth();
  const [accounts, setAccounts] = useState<DevDemoAccount[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/dev/demo-accounts', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.success && Array.isArray(data.accounts)) {
          setAccounts(data.accounts);
        }
      })
      .catch(() => {
        if (active) setErrorMessage('Impossible de charger les profils de simulation.');
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSelectProfile = async (accountId: string) => {
    setErrorMessage(null);
    setLoadingId(accountId);
    try {
      const resp = await fetch('/api/dev/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: accountId }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success || !data.user) {
        setErrorMessage(data.message || 'Impossible de lancer ce profil de test.');
        return;
      }
      const user = data.user as User;
      loginWithUser(user, data.sessionToken);
      refreshUserData();
      navigate(getDashboardByRole(user.currentRole || user.roles[0]));
    } catch {
      setErrorMessage('Erreur réseau lors du chargement du profil de test.');
    } finally {
      setLoadingId(null);
    }
  };

  const candidateScenarios = accounts.filter(
    (a) => a.category === 'candidat_scenario' || a.role === 'candidat'
  );
  const staffProfiles = accounts.filter(
    (a) => a.category !== 'candidat_scenario' && a.role !== 'candidat'
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-teal-800"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour à la connexion</span>
        </Link>
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-900 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full">
          <FlaskConical className="w-3.5 h-3.5 text-teal-700" />
          <span>Mode démonstration académique</span>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 sm:p-7 space-y-2">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h1 className="text-xl font-black text-slate-900">
              Profils et scénarios de démonstration académique
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Cet espace présente 6 scénarios candidats fictifs (dossiers complets, incomplets, pièce rejetée, interne USMBA, externe, multi-candidatures) et 4 profils acteurs permettant d&apos;évaluer l&apos;ensemble du cycle doctoral sans intégration externe réelle.
            </p>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span className="font-semibold">{errorMessage}</span>
        </div>
      )}

      {/* 6 Scénarios Candidats */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <GraduationCap className="w-4 h-4 text-teal-700" />
          <h2>Scénarios Candidats ({candidateScenarios.length})</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {candidateScenarios.map((acc) => (
            <div
              key={acc.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between gap-4 shadow-2xs"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full truncate">
                    {acc.spaceLabel}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">
                    {acc.studentOriginType === 'externe' ? 'Externe' : 'Interne USMBA'}
                  </span>
                </div>
                <div className="font-bold text-sm text-slate-900">
                  {acc.firstName} {acc.lastName}
                </div>
                <div className="text-[11px] font-mono text-slate-500 truncate">{acc.email}</div>
                <p className="text-xs text-slate-600 leading-relaxed">{acc.description}</p>
              </div>
              <button
                type="button"
                disabled={loadingId === acc.id}
                onClick={() => handleSelectProfile(acc.id)}
                className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-teal-300" />
                <span>{loadingId === acc.id ? 'Ouverture...' : 'Ouvrir cet espace'}</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 4 Profils Personnels & Gouvernance */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <Briefcase className="w-4 h-4 text-teal-700" />
          <h2>Profils Enseignants &amp; Administration ({staffProfiles.length})</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {staffProfiles.map((acc) => (
            <div
              key={acc.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between gap-4 shadow-2xs"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                    {acc.spaceLabel}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">Rôle : {acc.role}</span>
                </div>
                <div className="font-bold text-sm text-slate-900">
                  {acc.firstName} {acc.lastName}
                </div>
                <div className="text-[11px] font-mono text-slate-500">{acc.email}</div>
                <p className="text-xs text-slate-600 leading-relaxed">{acc.description}</p>
              </div>
              <button
                type="button"
                disabled={loadingId === acc.id}
                onClick={() => handleSelectProfile(acc.id)}
                className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-teal-300" />
                <span>
                  {loadingId === acc.id ? 'Ouverture...' : `Simuler : ${acc.spaceLabel}`}
                </span>
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
