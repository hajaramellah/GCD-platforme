import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Info,
  CheckCircle2,
  FlaskConical,
  UserCheck,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { User, UserRole } from '../../types';
import {
  GoogleAcademicButton,
  VerifiedGoogleAuthResponse,
} from '../../components/auth/GoogleAcademicButton';
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

export const Login: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const redirectParam =
    searchParams.get('redirect') || sessionStorage.getItem('gcd_pending_redirect') || '';

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifiedNewAccount, setVerifiedNewAccount] = useState<{
    email: string;
    onboardingToken?: string;
    user: VerifiedGoogleAuthResponse['user'];
  } | null>(null);

  const [devDemoAccounts, setDevDemoAccounts] = useState<DevDemoAccount[]>([]);
  const [devLoadingId, setDevLoadingId] = useState<string | null>(null);

  const { loginWithUser, refreshUserData } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    fetch('/api/dev/demo-accounts', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.success && Array.isArray(data.accounts)) {
          setDevDemoAccounts(data.accounts);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Clear stale error query params if present
  useEffect(() => {
    const oauthError = searchParams.get('oauth_error');
    if (oauthError) {
      setErrorMessage(oauthError);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('oauth_error');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams]);

  const registerHref = redirectParam
    ? `/register?redirect=${encodeURIComponent(redirectParam)}`
    : '/register';

  const completeSignInForUser = (matchedUser: User, sessionToken?: string) => {
    loginWithUser(matchedUser, sessionToken);
    refreshUserData();
    sessionStorage.removeItem('gcd_pending_redirect');

    const primaryRole = matchedUser.currentRole || matchedUser.roles[0];
    if (redirectParam && redirectParam.startsWith('/')) {
      navigate(redirectParam);
    } else {
      navigate(getDashboardByRole(primaryRole));
    }
  };

  const handleGoogleSuccess = (result: VerifiedGoogleAuthResponse) => {
    setErrorMessage(null);
    setVerifiedNewAccount(null);

    if (result.accountExists && result.existingUser) {
      if (!result.existingUser.isActive) {
        setErrorMessage("Votre compte a été temporairement désactivé par l'administration.");
        return;
      }
      completeSignInForUser(result.existingUser, result.sessionToken);
      return;
    }

    // Verified @usmba.ac.ma simulated Google account without an existing GCD profile -> redirect to registration
    if (result.user?.email) {
      setVerifiedNewAccount({
        email: result.user.email,
        onboardingToken: result.onboardingToken,
        user: result.user,
      });
      navigate(registerHref, {
        state: {
          verifiedGoogleUser: result.user,
          onboardingToken: result.onboardingToken,
        },
      });
    }
  };

  const handleGoogleError = (message: string) => {
    setVerifiedNewAccount(null);
    setErrorMessage(message);
  };

  const handleDevDemoLogin = async (accountId: string) => {
    setErrorMessage(null);
    setDevLoadingId(accountId);
    try {
      const resp = await fetch('/api/dev/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: accountId }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success || !data.user) {
        setErrorMessage(data.message || 'Impossible de démarrer le profil de simulation.');
        return;
      }
      completeSignInForUser(data.user, data.sessionToken);
    } catch {
      setErrorMessage('Erreur réseau lors du lancement du profil de simulation.');
    } finally {
      setDevLoadingId(null);
    }
  };

  const candidateScenarios = devDemoAccounts.filter(
    (a) => a.category === 'candidat_scenario' || a.role === 'candidat'
  );
  const staffProfiles = devDemoAccounts.filter(
    (a) => a.category !== 'candidat_scenario' && a.role !== 'candidat'
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 text-teal-800 bg-teal-50 border border-teal-200 px-3.5 py-1 rounded-full text-xs font-semibold">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
          <span>Mode démonstration académique • Connexion @usmba.ac.ma</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          Connexion à votre espace
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto">
          Simulation académique : l&apos;accès est réservé aux adresses fictives du domaine{' '}
          <span className="font-mono font-bold text-slate-700">@usmba.ac.ma</span> (les comptes Gmail personnels et autres domaines sont rejetés).
        </p>
      </div>

      {redirectParam && (
        <div className="max-w-xl mx-auto p-4 bg-teal-50 border border-teal-200 rounded-2xl text-xs text-teal-900 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <span>
            Connectez-vous ou créez votre compte candidat pour finaliser votre candidature aux sujets sélectionnés : votre sélection est conservée.
          </span>
        </div>
      )}

      {/* Authentification Google Simulée */}
      <div className="bg-white rounded-3xl border border-slate-200 p-7 sm:p-10 shadow-sm max-w-xl mx-auto space-y-6 text-center">
        {errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-start gap-2.5 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
        )}

        {verifiedNewAccount && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 space-y-2 text-left">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span className="font-semibold">
                Compte simulé vérifié ({verifiedNewAccount.email}). Aucun profil GCD n&apos;est encore associé : poursuivez vers la création de votre compte candidat.
              </span>
            </div>
            <div className="pl-6">
              <Link
                to={registerHref}
                state={{
                  verifiedGoogleUser: verifiedNewAccount.user,
                  onboardingToken: verifiedNewAccount.onboardingToken,
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-800 hover:underline"
              >
                <span>Créer mon compte candidat maintenant</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <GoogleAcademicButton onSuccess={handleGoogleSuccess} onError={handleGoogleError} mode="login" />

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Ouvre une fenêtre de simulation permettant de choisir un compte Google fictif <span className="font-mono font-semibold">@usmba.ac.ma</span>, de tester la création d&apos;un nouveau profil ou de vérifier le refus automatique d&apos;une adresse <span className="font-mono">@gmail.com</span>.
          </p>
        </div>

        <div className="pt-5 border-t border-slate-100 text-xs text-slate-500">
          Tester le parcours complet d&apos;inscription candidat ?{' '}
          <Link
            to={registerHref}
            className="font-bold text-teal-700 hover:underline inline-flex items-center gap-1 ml-1"
          >
            <span>Créer un compte candidat</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Accès direct aux scénarios de démonstration académique */}
      {devDemoAccounts.length > 0 && (
        <div className="max-w-5xl mx-auto rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-teal-900 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full">
                <FlaskConical className="w-3.5 h-3.5 text-teal-700" />
                <span>Mode démonstration académique — Profils de simulation</span>
              </div>
              <h2 className="text-base font-extrabold text-slate-900">
                Accès rapide aux 6 scénarios candidats et 4 profils acteurs
              </h2>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Toutes les personnes, dossiers et pièces justificatives ci-dessous sont fictifs et dédiés à la démonstration académique.
              </p>
            </div>
            <Link
              to="/dev/simulation-profils"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 px-3.5 py-2 rounded-xl shrink-0 whitespace-nowrap"
            >
              <span>Vue détaillée</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Scénarios Candidats ({candidateScenarios.length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {candidateScenarios.map((acc) => (
                <div
                  key={acc.id}
                  className="bg-slate-50/70 rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full truncate">
                        {acc.spaceLabel}
                      </span>
                    </div>
                    <div className="font-bold text-sm text-slate-900 pt-0.5">
                      {acc.firstName} {acc.lastName}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 truncate">{acc.email}</div>
                    <p className="text-[11px] text-slate-600 leading-relaxed pt-0.5">
                      {acc.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={devLoadingId === acc.id}
                    onClick={() => handleDevDemoLogin(acc.id)}
                    className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-teal-300 shrink-0" />
                    <span>{devLoadingId === acc.id ? 'Ouverture...' : 'Ouvrir cet espace'}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Profils Enseignants &amp; Administration ({staffProfiles.length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {staffProfiles.map((acc) => (
                <div
                  key={acc.id}
                  className="bg-slate-50/70 rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-800 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">
                        {acc.spaceLabel}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{acc.role}</span>
                    </div>
                    <div className="font-bold text-sm text-slate-900 pt-0.5">
                      {acc.firstName} {acc.lastName}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">{acc.email}</div>
                    <p className="text-[11px] text-slate-600 leading-relaxed pt-0.5">
                      {acc.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={devLoadingId === acc.id}
                    onClick={() => handleDevDemoLogin(acc.id)}
                    className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-teal-300 shrink-0" />
                    <span>
                      {devLoadingId === acc.id ? 'Ouverture...' : `Simuler : ${acc.spaceLabel}`}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
