import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { User } from '../../types';

export interface VerifiedGoogleAuthResponse {
  accountExists: boolean;
  existingUser?: User;
  sessionToken?: string;
  onboardingToken?: string;
  user?: {
    googleId: string;
    email: string;
    name: string;
    givenName: string;
    familyName: string;
    photoUrl: string;
    verifiedEmail: boolean;
  };
}

interface GoogleAcademicButtonProps {
  onSuccess: (result: VerifiedGoogleAuthResponse) => void;
  onError: (message: string, errorCode?: string) => void;
  disabled?: boolean;
  mode?: 'login' | 'register';
}

interface SimulatedAccountPreset {
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  subtitle: string;
  badge: string;
  badgeClass: string;
}

const USMBA_SIMULATED_ACCOUNTS: SimulatedAccountPreset[] = [
  {
    email: 'kenza.benali@usmba.ac.ma',
    name: 'Kenza Benali',
    givenName: 'Kenza',
    familyName: 'BENALI',
    subtitle: 'Scénario 1 • Interne USMBA — Dossier complet (entretien programmé)',
    badge: 'Interne • Complet',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  {
    email: 'youssef.berrada@usmba.ac.ma',
    name: 'Youssef Berrada',
    givenName: 'Youssef',
    familyName: 'BERRADA',
    subtitle: 'Scénario 2 • Interne USMBA — Dossier incomplet (pièce manquante)',
    badge: 'Interne • Incomplet',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    email: 'amine.tazi@usmba.ac.ma',
    name: 'Amine Tazi',
    givenName: 'Amine',
    familyName: 'TAZI',
    subtitle: 'Scénario 3 • Interne USMBA — Pièce rejetée avec motif de correction',
    badge: 'Interne • Rejeté',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  {
    email: 'nadia.chraibi@usmba.ac.ma',
    name: 'Nadia Chraibi',
    givenName: 'Nadia',
    familyName: 'CHRAIBI',
    subtitle: 'Scénario 4 • Externe (UH2C) — Dossier complet en attente',
    badge: 'Externe • Complet',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  {
    email: 'tarik.elmansouri@usmba.ac.ma',
    name: 'Tarik El Mansouri',
    givenName: 'Tarik',
    familyName: 'EL MANSOURI',
    subtitle: 'Scénario 5 • Externe (UCA) — Complétion progressive (pièces manquantes)',
    badge: 'Externe • Incomplet',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    email: 'imane.bennani@usmba.ac.ma',
    name: 'Imane Bennani',
    givenName: 'Imane',
    familyName: 'BENNANI',
    subtitle: 'Scénario 6 • Multi-candidatures — Pièces communes réutilisées',
    badge: 'Multi-sujets',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  {
    email: 'nouveau.candidat@usmba.ac.ma',
    name: 'Salim Ouazzani',
    givenName: 'Salim',
    familyName: 'OUAZZANI',
    subtitle: 'Compte Google @usmba.ac.ma sans profil GCD → Création de compte candidat',
    badge: 'Nouveau profil',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
];

export const GoogleAcademicButton: React.FC<GoogleAcademicButtonProps> = ({
  onSuccess,
  onError,
  disabled = false,
  mode = 'login',
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [customEmail, setCustomEmail] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  const simulateAccountSelection = async (account: {
    email: string;
    name?: string;
    givenName?: string;
    familyName?: string;
  }) => {
    setModalError(null);
    setIsAuthenticating(true);
    try {
      const resp = await fetch('/api/auth/google/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(account),
      });
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        const msg =
          data.message ||
          'Accès refusé. Veuillez utiliser votre compte Google académique USMBA (@usmba.ac.ma).';
        setModalError(msg);
        onError(msg, data.errorCode);
        return;
      }

      setIsPickerOpen(false);
      onSuccess({
        accountExists: Boolean(data.accountExists),
        existingUser: data.existingUser,
        sessionToken: data.sessionToken,
        onboardingToken: data.onboardingToken,
        user: data.user,
      });
    } catch {
      const msg = 'Erreur de communication lors de la simulation de connexion Google.';
      setModalError(msg);
      onError(msg);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail.trim()) {
      setModalError('Veuillez saisir une adresse e-mail.');
      return;
    }
    simulateAccountSelection({ email: customEmail.trim() });
  };

  return (
    <div className="flex flex-col items-center space-y-2.5 w-full">
      <button
        type="button"
        onClick={() => {
          setModalError(null);
          setCustomEmail('');
          setIsPickerOpen(true);
        }}
        disabled={disabled || isAuthenticating}
        className="w-full max-w-sm bg-white hover:bg-slate-50 text-slate-800 font-bold py-3.5 px-6 rounded-2xl border-2 border-slate-200 hover:border-slate-400 transition-all shadow-xs flex items-center justify-center gap-3 text-sm disabled:opacity-60 cursor-pointer"
      >
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>Continuer avec Google</span>
      </button>

      <div className="text-[11px] text-slate-400 font-medium">
        Mode démonstration académique • Simulation sélecteur @usmba.ac.ma
      </div>

      {/* Simulated Google Account Chooser Modal */}
      {isPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto text-left">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg my-6 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/70">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Choisir un compte Google (Simulation)
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500">
                  Mode démonstration académique • Domaine autorisé :{' '}
                  <span className="font-mono font-bold text-slate-700">@usmba.ac.ma</span>{' '}
                  {mode === 'register' ? '• Association au nouveau profil' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {modalError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-bold">Authentification refusée par le serveur</div>
                    <div>{modalError}</div>
                  </div>
                </div>
              )}

              {isAuthenticating && (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs font-semibold text-teal-900 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                  <span>Vérification du domaine @usmba.ac.ma et ouverture de session...</span>
                </div>
              )}

              {/* Preset Simulated @usmba.ac.ma Accounts */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
                  <span>Comptes fictifs @usmba.ac.ma disponibles</span>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                  {USMBA_SIMULATED_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      disabled={isAuthenticating}
                      onClick={() =>
                        simulateAccountSelection({
                          email: acc.email,
                          name: acc.name,
                          givenName: acc.givenName,
                          familyName: acc.familyName,
                        })
                      }
                      className="w-full px-4 py-3 bg-white hover:bg-slate-50 text-left flex items-center justify-between gap-3 transition-colors disabled:opacity-60 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                          {acc.email === 'nouveau.candidat@usmba.ac.ma' ? (
                            <UserPlus className="w-4 h-4 text-teal-300" />
                          ) : (
                            `${acc.givenName[0]}${acc.familyName[0]}`
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900">{acc.name}</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${acc.badgeClass}`}
                            >
                              {acc.badge}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-600 truncate">
                            {acc.email}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{acc.subtitle}</div>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Domain Control Test + Custom Simulated Email */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-700">
                    Tester un autre compte ou vérifier le blocage Gmail :
                  </span>
                  <button
                    type="button"
                    disabled={isAuthenticating}
                    onClick={() =>
                      simulateAccountSelection({
                        email: 'exemple.perso@gmail.com',
                        name: 'Compte Gmail Personnel',
                      })
                    }
                    className="text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Tester exemple.perso@gmail.com (Refus)
                  </button>
                </div>

                <form onSubmit={handleCustomSubmit} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      placeholder="prenom.nom@usmba.ac.ma ou @gmail.com..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isAuthenticating}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shrink-0 whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-300" />
                    <span>Tester</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
