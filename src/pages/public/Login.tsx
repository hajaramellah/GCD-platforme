import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, AlertCircle, ArrowRight, Info, CheckCircle2, FlaskConical, UserCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { User, UserRole } from '../../types';
import {
  GoogleAcademicButton,
  VerifiedGoogleAuthResponse,
} from '../../components/auth/GoogleAcademicButton';

interface DevDemoAccount {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  spaceLabel: string;
  profileLabel: string;
  description: string;
  studentOriginType: string | null;
}

const getDashboardByRole = (role: UserRole): string => {
  switch (role) {
    case 'candidat':
      return '/candidat/dashboard';
    case 'enseignant_chercheur':
      return '/chercheur/dashboard';
    case 'responsable_labo':
      return '/labo/dashboard';
    case 'administration':
      return '/administration/dashboard';
    case 'responsable_formation':
      return '/formation/dashboard';
    case 'jury':
      return '/jury/dashboard';
    case 'doctorant':
      return '/doctorant/dashboard';
    case 'directeur_these':
      return '/directeur/dashboard';
    case 'responsable_gcd':
      return '/superadmin/dashboard';
    default:
      return '/';
  }
};

export const Login: React.FC = () => {
  const [searchParams] = useSearchParams();
  const redirectParam =
    searchParams.get('redirect') || sessionStorage.getItem('gcd_pending_redirect') || '';

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifiedNewAccount, setVerifiedNewAccount] = useState<{
    email: string;
    onboardingToken?: string;
    user: VerifiedGoogleAuthResponse['user'];
  } | null>(null);

  // Strictly development-only demo accounts state
  const [devDemoAccounts, setDevDemoAccounts] = useState<DevDemoAccount[]>([]);
  const [devLoadingId, setDevLoadingId] = useState<string | null>(null);

  const { loginWithUser, refreshUserData } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
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

    // Verified @usmba.ac.ma Google account without an existing GCD profile -> redirect to registration
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
    if (!import.meta.env.DEV) return;
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
        setErrorMessage(data.message || 'Impossible de démarrer la session de test.');
        return;
      }
      completeSignInForUser(data.user, data.sessionToken);
    } catch {
      setErrorMessage('Erreur réseau lors du lancement du compte de test.');
    } finally {
      setDevLoadingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-14 space-y-8">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 text-teal-700 bg-teal-50 border border-teal-200 px-3.5 py-1 rounded-full text-xs font-semibold">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
          Authentification Académique Google (@usmba.ac.ma) — GCD USMBA
        </div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          Connexion à votre espace
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto">
          L&apos;accès à la plateforme est réservé exclusivement aux comptes Google académiques USMBA (<span className="font-mono font-bold text-slate-700">@usmba.ac.ma</span>).
        </p>
      </div>

      {redirectParam && (
        <div className="max-w-xl mx-auto p-4 bg-teal-50 border border-teal-200 rounded-2xl text-xs text-teal-900 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <span>
            Authentifiez-vous avec votre compte Google académique (@usmba.ac.ma) pour finaliser votre candidature au sujet sélectionné : vous serez automatiquement redirigé(e) après validation.
          </span>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-sm max-w-xl mx-auto space-y-7 text-center">
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
                Compte Google académique vérifié ({verifiedNewAccount.email}). Aucun profil GCD n&apos;est encore associé : poursuivez vers la création de votre compte candidat.
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
          <GoogleAcademicButton onSuccess={handleGoogleSuccess} onError={handleGoogleError} />

          <p className="text-[11px] text-slate-500">
            Sélectionnez votre compte Google académique <span className="font-mono font-semibold">@usmba.ac.ma</span>. Tout autre domaine (ex. <span className="font-mono">@gmail.com</span>) est automatiquement refusé par le serveur.
          </p>
        </div>

        <div className="pt-5 border-t border-slate-100 text-xs text-slate-500">
          Première visite avec votre compte académique @usmba.ac.ma ?{' '}
          <Link
            to={registerHref}
            className="font-bold text-teal-700 hover:underline inline-flex items-center gap-1 ml-1"
          >
            <span>Créer un compte candidat</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Strictly Development-Only Separated Demo Testing Panel */}
      {import.meta.env.DEV && devDemoAccounts.length > 0 && (
        <div className="max-w-4xl mx-auto rounded-3xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-6 sm:p-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-900 bg-amber-200/70 px-2.5 py-0.5 rounded-full">
                <FlaskConical className="w-3.5 h-3.5" />
                Environnement de Développement Uniquement — Désactivé en Production
              </div>
              <h2 className="text-base font-extrabold text-slate-900">
                Comptes de démonstration indépendants (1 profil = 1 compte séparé)
              </h2>
            </div>
            <span className="text-[11px] font-medium text-amber-900">
              Mécanisme de test local sans mot de passe
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {devDemoAccounts.map((acc) => (
              <div
                key={acc.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-3 shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                      {acc.spaceLabel}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Rôle : {acc.role}
                    </span>
                  </div>
                  <div className="font-bold text-sm text-slate-900">
                    {acc.firstName} {acc.lastName}
                  </div>
                  <div className="text-[11px] font-mono text-slate-600">{acc.email}</div>
                  <p className="text-[11px] text-slate-500 leading-relaxed pt-0.5">
                    {acc.description}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={devLoadingId === acc.id}
                  onClick={() => handleDevDemoLogin(acc.id)}
                  className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
                >
                  <UserCheck className="w-3.5 h-3.5 text-teal-300" />
                  <span>
                    {devLoadingId === acc.id ? 'Ouverture...' : `Tester cet espace (${acc.spaceLabel})`}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
