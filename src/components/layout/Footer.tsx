import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, ShieldCheck, RefreshCw } from 'lucide-react';
import { storageService } from '../../services/storageService';

export const Footer: React.FC = () => {
  const [confirmReset, setConfirmReset] = useState(false);

  const handleResetData = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    storageService.resetToDefaults();
    localStorage.removeItem('gcd_active_user_id');
    window.location.href = '/';
  };

  return (
    <footer className="bg-slate-900 text-slate-400 text-xs border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Col 1 */}
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white">
                <GraduationCap className="w-5 h-5 text-teal-200" />
              </div>
              <span>GCD USMBA — Centre d'Études Doctorales</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed max-w-lg">
              Plateforme numérique de gestion intégrale du cycle doctoral (catalogue des sujets, dépôt de candidatures, instruction administrative, audition, délibération, inscription et réinscriptions annuelles).
            </p>
            <div className="text-[11px] text-amber-300/90 bg-amber-950/40 border border-amber-800/60 p-2.5 rounded-xl max-w-lg">
              <strong>Notice académique :</strong> Plateforme universitaire de modernisation et de suivi du cycle doctoral de l'Université Sidi Mohamed Ben Abdellah (USMBA, Fès, Maroc).
            </div>
          </div>

          {/* Col 2 */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-white">Navigation Rapide</h5>
            <ul className="space-y-1.5">
              <li>
                <Link to="/sujets" className="hover:text-teal-400 transition-colors">
                  Catalogue des Sujets de Thèse
                </Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-teal-400 transition-colors">
                  Connexion avec Google
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-teal-400 transition-colors">
                  Créer un compte candidat
                </Link>
              </li>
              <li>
                <Link to="/faq-aide" className="hover:text-teal-400 transition-colors">
                  FAQ & Règlements CEDoc
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3 */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-white">Administration Locale</h5>
            <p className="text-[11px] text-slate-400">
              Réinitialiser l'espace local de démonstration vers les données initiales de l'USMBA.
            </p>
            {confirmReset ? (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleResetData}
                  className="inline-flex items-center gap-1.5 text-xs text-white bg-rose-700 hover:bg-rose-600 px-3 py-1.5 rounded-lg transition-colors font-semibold"
                >
                  Confirmer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="text-xs text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-800"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleResetData}
                className="inline-flex items-center gap-1.5 text-xs text-rose-300 hover:text-white bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60 px-3 py-1.5 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Réinitialiser les données démo
              </button>
            )}
          </div>
        </div>

        <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px]">
          <div>
            © 2026 Université Sidi Mohamed Ben Abdellah — CEDoc Fès. Tous droits réservés.
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-slate-400">
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              Conformité CNPND Décret 2-23-64
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
