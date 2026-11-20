import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { User } from '../../types';

declare global {
  interface Window {
    google?: any;
  }
}

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
}

export const GoogleAcademicButton: React.FC<GoogleAcademicButtonProps> = ({
  onSuccess,
  onError,
  disabled = false,
}) => {
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  const [gisClientId, setGisClientId] = useState<string>(
    (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()
  );
  const [oauthPopupEnabled, setOauthPopupEnabled] = useState<boolean>(false);
  const [gisReady, setGisReady] = useState<boolean>(false);
  const [configLoaded, setConfigLoaded] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [configNotice, setConfigNotice] = useState<string | null>(null);

  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  // Fetch public Google OAuth configuration from server
  useEffect(() => {
    let active = true;
    fetch('/api/auth/google/config')
      .then((r) => r.json())
      .then((cfg) => {
        if (!active) return;
        if (cfg.gisClientId && !gisClientId) {
          setGisClientId(cfg.gisClientId);
        }
        setOauthPopupEnabled(Boolean(cfg.oauthPopupEnabled));
        setConfigLoaded(true);
      })
      .catch(() => {
        if (active) setConfigLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Verify Google credential (ID Token JWT) exclusively on the server
  const verifyCredentialOnServer = async (credential: string) => {
    setIsVerifying(true);
    setConfigNotice(null);
    try {
      const resp = await fetch('/api/auth/google/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ credential }),
      });
      const result = await resp.json();

      if (!resp.ok || !result.success) {
        onErrorRef.current(
          result.message ||
            'Accès refusé. Veuillez utiliser votre compte Google académique USMBA (@usmba.ac.ma).',
          result.errorCode
        );
        return;
      }

      onSuccessRef.current({
        accountExists: Boolean(result.accountExists),
        existingUser: result.existingUser,
        sessionToken: result.sessionToken,
        onboardingToken: result.onboardingToken,
        user: result.user,
      });
    } catch {
      onErrorRef.current(
        "Erreur de communication avec le serveur lors de la vérification du jeton Google."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  // Load Google Identity Services SDK when client_id is available
  useEffect(() => {
    if (!gisClientId) return;

    const initGis = () => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        window.google.accounts.id.initialize({
          client_id: gisClientId,
          hd: 'usmba.ac.ma',
          ux_mode: 'popup',
          callback: (response: { credential?: string }) => {
            if (response?.credential) {
              verifyCredentialOnServer(response.credential);
            } else {
              onErrorRef.current("Aucun jeton d'authentification n'a été retourné par Google.");
            }
          },
        });
        googleBtnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          width: 340,
          text: 'continue_with',
          locale: 'fr',
          shape: 'pill',
        });
        setGisReady(true);
      }
    };

    if (window.google?.accounts?.id) {
      initGis();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existingScript) {
      existingScript.addEventListener('load', initGis);
      return () => existingScript.removeEventListener('load', initGis);
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', initGis);
    document.body.appendChild(script);

    return () => {
      script.removeEventListener('load', initGis);
    };
  }, [gisClientId]);

  // Listen for cross-origin postMessage when OAuth 2.0 Authorization Code popup completes
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const origin = event.origin || '';
      const isTrustedOrigin =
        origin === window.location.origin ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1');
      if (!isTrustedOrigin || !event.data) return;

      if (event.data.type === 'GOOGLE_OAUTH_ERROR') {
        setIsVerifying(false);
        onErrorRef.current(
          event.data.message ||
            'Accès refusé. Veuillez utiliser votre compte Google académique USMBA (@usmba.ac.ma).',
          event.data.errorCode
        );
        return;
      }

      if (event.data.type === 'GOOGLE_OAUTH_SUCCESS') {
        setIsVerifying(true);
        try {
          if (event.data.accountExists) {
            const meResp = await fetch('/api/auth/me', { credentials: 'include' });
            const meData = await meResp.json();
            if (meResp.ok && meData.success && meData.user) {
              onSuccessRef.current({
                accountExists: true,
                existingUser: meData.user,
              });
            } else {
              onErrorRef.current(
                meData.message ||
                  'Accès refusé. Veuillez utiliser votre compte Google académique USMBA (@usmba.ac.ma).'
              );
            }
          } else {
            const obResp = await fetch('/api/auth/google/onboarding', { credentials: 'include' });
            const obData = await obResp.json();
            if (obResp.ok && obData.success && obData.user) {
              onSuccessRef.current({
                accountExists: false,
                user: obData.user,
              });
            } else {
              onErrorRef.current(
                obData.message ||
                  'Accès refusé. Veuillez utiliser votre compte Google académique USMBA (@usmba.ac.ma).'
              );
            }
          }
        } catch {
          onErrorRef.current("Erreur lors de la récupération de la session Google vérifiée.");
        } finally {
          setIsVerifying(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleFallbackGoogleClick = async () => {
    setConfigNotice(null);

    if (oauthPopupEnabled) {
      setIsVerifying(true);
      try {
        const resp = await fetch('/api/auth/google/url', { credentials: 'include' });
        const data = await resp.json();
        if (!resp.ok || !data.url || !String(data.url).startsWith('https://accounts.google.com/')) {
          setIsVerifying(false);
          setConfigNotice(
            data.message ||
              "L'authentification Google OAuth n'est pas encore configurée sur cet environnement."
          );
          return;
        }
        const popup = window.open(data.url, 'usmba_google_oauth', 'width=540,height=660');
        if (!popup) {
          setIsVerifying(false);
          onErrorRef.current(
            "Le navigateur a bloqué l'ouverture de la fenêtre Google. Veuillez autoriser les pop-ups pour ce site."
          );
        }
      } catch {
        setIsVerifying(false);
        onErrorRef.current("Impossible d'initier la connexion Google OAuth.");
      }
      return;
    }

    if (gisClientId && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
      return;
    }

    setConfigNotice(
      "Le service Google OAuth n'est pas encore configuré sur ce serveur (variable VITE_GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET requise). Aucune saisie manuelle d'adresse e-mail n'est autorisée pour des raisons de sécurité."
    );
  };

  return (
    <div className="flex flex-col items-center space-y-3 w-full">
      {isVerifying && (
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-4 py-2 rounded-xl">
          <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
          <span>Vérification du jeton Google et du domaine @usmba.ac.ma...</span>
        </div>
      )}

      {/* Official GIS rendered button when Client ID is configured */}
      {gisClientId && (
        <div
          ref={googleBtnRef}
          className={`flex justify-center min-h-[44px] ${
            disabled || isVerifying ? 'opacity-50 pointer-events-none' : ''
          }`}
        />
      )}

      {/* Clean "Continuer avec Google" button when GIS button isn't rendered */}
      {(!gisClientId || !gisReady) && (
        <button
          type="button"
          onClick={handleFallbackGoogleClick}
          disabled={disabled || isVerifying || !configLoaded}
          className="w-full max-w-sm bg-white hover:bg-slate-50 text-slate-800 font-bold py-4 px-6 rounded-2xl border-2 border-slate-200 hover:border-slate-400 transition-all shadow-xs flex items-center justify-center gap-3 text-sm disabled:opacity-60"
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
      )}

      {configNotice && (
        <div className="w-full p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5 text-left">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{configNotice}</span>
        </div>
      )}
    </div>
  );
};
