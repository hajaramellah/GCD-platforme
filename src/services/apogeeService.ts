import { ApogeeLookupResult, StudentOriginType } from '../types';
import { getInMemorySessionToken } from './authSession';

export const apogeeService = {
  async getStatus(): Promise<{ configured: boolean; connectionStatus: string; message: string }> {
    try {
      const resp = await fetch('/api/apogee/status', { credentials: 'include' });
      if (!resp.ok) {
        return {
          configured: false,
          connectionStatus: 'not_configured',
          message: 'Impossible de vérifier le statut APOGÉE.',
        };
      }
      return await resp.json();
    } catch {
      return {
        configured: false,
        connectionStatus: 'not_configured',
        message: 'Service APOGÉE hors ligne.',
      };
    }
  },

  async lookupStudent(params: {
    cne?: string;
    cin?: string;
    originType?: StudentOriginType;
  }): Promise<ApogeeLookupResult> {
    const query = new URLSearchParams();
    if (params.cne) query.set('cne', params.cne);
    if (params.cin) query.set('cin', params.cin);
    if (params.originType) query.set('originType', params.originType);

    const token = getInMemorySessionToken();
    try {
      const resp = await fetch(`/api/apogee/student?${query.toString()}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        return {
          configured: false,
          connectionStatus: 'not_configured',
          isDemoData: false,
          studentOriginType: params.originType || 'externe',
          message:
            'Connexion officielle au système APOGÉE non configurée ou session non authentifiée.',
        };
      }
      return await resp.json();
    } catch {
      return {
        configured: false,
        connectionStatus: 'not_configured',
        isDemoData: false,
        studentOriginType: params.originType || 'externe',
        message: 'Erreur réseau lors de la consultation du service APOGÉE.',
      };
    }
  },
};
