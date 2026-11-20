import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { storageService } from '../services/storageService';
import { setInMemorySessionToken } from '../services/authSession';

export interface RegisterPayload extends Partial<User> {
  googleCredential?: string;
  onboardingToken?: string;
}

interface AuthContextType {
  currentUser: User | null;
  currentRole: UserRole;
  sessionToken: string | null;
  setCurrentRole: (role: UserRole) => void;
  loginWithUser: (user: User, token?: string) => void;
  switchDemoUser: (userId: string, role?: UserRole) => void;
  switchRoleQuick: (role: UserRole) => void;
  login: (email: string, password?: string) => { success: boolean; message: string };
  register: (userData: RegisterPayload) => Promise<{ success: boolean; message: string; user?: User }>;
  logout: () => void;
  activateAccount: (email: string) => boolean;
  requestPasswordReset: (email: string) => { success: boolean; token: string; message: string };
  resetPassword: (token: string, newPass: string) => boolean;
  unreadNotificationsCount: number;
  refreshUserData: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ALLOWED_ACADEMIC_DOMAIN = 'usmba.ac.ma';

function isStrictUsmbaEmail(email?: string): boolean {
  if (!email) return false;
  const parts = email.trim().toLowerCase().split('@');
  return parts.length === 2 && parts[0].length > 0 && parts[1] === ALLOWED_ACADEMIC_DOMAIN;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('gcd_active_user_id');
    if (!saved) return null;
    const users = storageService.getUsers();
    const match = users.find((u) => u.id === saved) || null;
    if (match && !isStrictUsmbaEmail(match.email)) {
      localStorage.removeItem('gcd_active_user_id');
      return null;
    }
    return match;
  });

  const [currentRole, setCurrentRoleState] = useState<UserRole>(() => {
    return currentUser?.currentRole || currentUser?.roles?.[0] || 'candidat';
  });

  // Held exclusively in React memory (never persisted to localStorage)
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);

  const refreshNotifications = () => {
    if (!currentUser) {
      setUnreadNotificationsCount(0);
      return;
    }
    const notifs = storageService.getNotifications();
    const count = notifs.filter(
      (n) => !n.isRead && (!n.userId || n.userId === currentUser.id || n.targetRole === currentRole)
    ).length;
    setUnreadNotificationsCount(count);
  };

  // Validate active session against server cookie on mount
  useEffect(() => {
    let active = true;
    const verifyServerSession = async () => {
      try {
        const resp = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
          headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
        });
        if (!active) return;

        if (resp.ok) {
          const data = await resp.json();
          if (data.success && data.user && isStrictUsmbaEmail(data.user.email)) {
            const existingLocal = storageService.getUserById(data.user.id);
            const mergedUser: User = {
              ...(existingLocal || {}),
              ...data.user,
              sharedDocuments: existingLocal?.sharedDocuments || data.user.sharedDocuments || [],
              identityDocuments: existingLocal?.identityDocuments || data.user.identityDocuments,
            };
            storageService.saveUser(mergedUser);
            setCurrentUser(mergedUser);
            setCurrentRoleState(mergedUser.currentRole || mergedUser.roles[0] || 'candidat');
            localStorage.setItem('gcd_active_user_id', mergedUser.id);
            return;
          }
        }

        // If server has no valid session, clear stale client state
        if (resp.status === 401 || resp.status === 403) {
          localStorage.removeItem('gcd_active_user_id');
          setCurrentUser(null);
          setSessionToken(null);
          setInMemorySessionToken(null);
        }
      } catch {
        // Keep silent if server is temporarily restarting
      }
    };

    verifyServerSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('gcd_active_user_id', currentUser.id);
    } else {
      localStorage.removeItem('gcd_active_user_id');
    }
    refreshNotifications();
  }, [currentUser?.id, currentRole]);

  const setCurrentRole = (role: UserRole) => {
    if (!currentUser) return;
    if (!currentUser.roles.includes(role)) {
      console.warn(`Tentative de changement vers un rôle non attribué : ${role}`);
      return;
    }
    setCurrentRoleState(role);
    const updated = { ...currentUser, currentRole: role };
    storageService.saveUser(updated);
    setCurrentUser(updated);
    fetch('/api/auth/switch-role', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ role }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.sessionToken) {
          setSessionToken(d.sessionToken);
          setInMemorySessionToken(d.sessionToken);
        }
      })
      .catch(() => undefined);
  };

  const loginWithUser = (user: User, token?: string) => {
    if (!isStrictUsmbaEmail(user.email)) {
      console.warn('Tentative de connexion refusée : domaine différent de @usmba.ac.ma');
      return;
    }
    const existingLocal = storageService.getUserById(user.id);
    const merged: User = {
      ...(existingLocal || {}),
      ...user,
      sharedDocuments: existingLocal?.sharedDocuments || user.sharedDocuments || [],
      identityDocuments: existingLocal?.identityDocuments || user.identityDocuments,
    };
    storageService.saveUser(merged);
    const role = merged.currentRole || merged.roles[0] || 'candidat';
    setCurrentUser({ ...merged, currentRole: role });
    setCurrentRoleState(role);
    if (token) {
      setSessionToken(token);
      setInMemorySessionToken(token);
    }
    localStorage.setItem('gcd_active_user_id', merged.id);
  };

  const switchDemoUser = (_userId: string, _role?: UserRole) => {
    // Redirected to explicit simulation selector or simulated Google picker
    console.warn('Utilisez le sélecteur de profils de simulation ou « Continuer avec Google » (@usmba.ac.ma).');
  };

  const switchRoleQuick = (targetRole: UserRole) => {
    if (!currentUser) return;
    if (currentUser.roles.includes(targetRole)) {
      setCurrentRole(targetRole);
    }
  };

  const login = (_email: string, _password?: string) => {
    return {
      success: false,
      message: 'Veuillez utiliser le bouton « Continuer avec Google » (@usmba.ac.ma) ou un profil de simulation.',
    };
  };

  const register = async (
    userData: RegisterPayload
  ): Promise<{ success: boolean; message: string; user?: User }> => {
    if (!userData.firstName || !userData.lastName || !userData.cin) {
      return { success: false, message: 'Veuillez remplir tous les champs obligatoires du formulaire.' };
    }

    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userData.onboardingToken ? { Authorization: `Bearer ${userData.onboardingToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(userData),
      });

      const data = await resp.json();
      if (!resp.ok || !data.success || !data.user) {
        return {
          success: false,
          message:
            data.message ||
            'Impossible de créer le compte : authentification Google académique (@usmba.ac.ma) requise.',
        };
      }

      const serverUser = data.user as User;
      const newUser: User = {
        ...serverUser,
        academicYear: userData.academicYear || '',
        sharedDocuments: userData.sharedDocuments || [],
        identityDocuments: userData.identityDocuments || serverUser.identityDocuments,
      };

      storageService.saveUser(newUser);
      storageService.logAction(
        { id: newUser.id, name: `${newUser.firstName} ${newUser.lastName}`, role: 'candidat' },
        'CREATION_COMPTE',
        'utilisateur',
        newUser.id,
        `Création du compte candidat (${newUser.registrationMethod || 'manual'}) pour ${newUser.firstName} ${newUser.lastName}`
      );

      setCurrentUser(newUser);
      setCurrentRoleState('candidat');
      if (data.sessionToken) {
        setSessionToken(data.sessionToken);
        setInMemorySessionToken(data.sessionToken);
      }
      localStorage.setItem('gcd_active_user_id', newUser.id);

      return {
        success: true,
        message: 'Compte créé avec succès ! Bienvenue sur la plateforme GCD USMBA.',
        user: newUser,
      };
    } catch {
      return {
        success: false,
        message: 'Erreur de communication avec le serveur lors de la création du compte.',
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('gcd_active_user_id');
    setCurrentUser(null);
    setCurrentRoleState('candidat');
    setSessionToken(null);
    setInMemorySessionToken(null);
    setUnreadNotificationsCount(0);
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
  };

  const activateAccount = (_email: string) => false;

  const requestPasswordReset = (_email: string) => ({
    success: false,
    token: '',
    message: 'Authentification gérée exclusivement par Google (@usmba.ac.ma).',
  });

  const resetPassword = (_token: string, _newPass: string) => false;

  const refreshUserData = () => {
    if (currentUser) {
      const refreshed = storageService.getUserById(currentUser.id);
      if (refreshed) setCurrentUser(refreshed);
    }
    refreshNotifications();
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentRole,
        sessionToken,
        setCurrentRole,
        loginWithUser,
        switchDemoUser,
        switchRoleQuick,
        login,
        register,
        logout,
        activateAccount,
        requestPasswordReset,
        resetPassword,
        unreadNotificationsCount,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
