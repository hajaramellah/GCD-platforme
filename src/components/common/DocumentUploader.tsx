import React, { useState } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Building2,
  UserCheck,
  Eye,
  Clock,
  Download
} from 'lucide-react';
import { ApplicationDocument } from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  downloadProtectedDocument,
  ViewableDocumentInput
} from '../../services/documentService';
import { DocumentViewerModal } from './DocumentViewerModal';

interface DocumentUploaderProps {
  document: ApplicationDocument;
  onUpload: (docId: string, file: { fileName: string; fileSize: number; fileUrl: string }) => void;
  readOnly?: boolean;
  onPreview?: (doc: ApplicationDocument) => void;
  ownerId?: string;
  ownerEmail?: string;
  ownerCin?: string;
}

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  document,
  onUpload,
  readOnly = false,
  onPreview,
  ownerId,
  ownerEmail,
  ownerCin
}) => {
  const { currentUser, currentRole, sessionToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<ViewableDocumentInput | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'docx'];
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (!ext || !allowedExtensions.includes(ext)) {
      setError('Format non autorisé. Formats acceptés : PDF, JPG, JPEG, PNG, DOCX.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Le fichier dépasse la taille maximale autorisée (5 Mo).');
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      let finalUrl = dataUrl;

      // Persist to protected backend document store when session is active
      try {
        const resp = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
          },
          credentials: 'include',
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            dataUrl,
            docType: document.type
          })
        });
        if (resp.ok) {
          const resData = await resp.json();
          if (resData.protectedUrl) {
            finalUrl = resData.protectedUrl;
          }
        }
      } catch {
        // Offline / localStorage persistence continues cleanly
      } finally {
        setIsUploading(false);
      }

      onUpload(document.id, {
        fileName: file.name,
        fileSize: file.size,
        fileUrl: finalUrl
      });
    };
    reader.onerror = () => {
      setIsUploading(false);
      setError('Impossible de lire ce fichier sur votre appareil.');
    };
    reader.readAsDataURL(file);
  };

  const buildViewableDoc = (): ViewableDocumentInput => ({
    id: document.id,
    label: document.label,
    fileName: document.fileName,
    fileUrl: document.fileUrl,
    fileSize: document.fileSize,
    status: document.status,
    provenance: document.provenance,
    isDemoApogee: document.isDemoApogee,
    rejectionReason: document.rejectionReason,
    ownerId: ownerId || currentUser?.id,
    ownerEmail: ownerEmail || currentUser?.email,
    ownerCin: ownerCin || currentUser?.cin
  });

  const handleConsult = () => {
    setError(null);
    if (onPreview) {
      onPreview(document);
      return;
    }
    setPreviewDoc(buildViewableDoc());
  };

  const handleDownload = async () => {
    setError(null);
    setIsDownloading(true);
    try {
      await downloadProtectedDocument(buildViewableDoc(), {
        sessionToken,
        currentUserId: currentUser?.id,
        currentUserEmail: currentUser?.email,
        currentUserCin: currentUser?.cin,
        activeRole: currentRole
      });
    } catch (err: any) {
      setError(err?.message || 'Téléchargement impossible pour ce document.');
    } finally {
      setIsDownloading(false);
    }
  };

  const getStatusBadge = () => {
    switch (document.status) {
      case 'valide':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Validé
          </span>
        );
      case 'rejete':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
            <XCircle className="w-3.5 h-3.5" />
            Rejeté
          </span>
        );
      case 'complement_requis':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            Complément requis
          </span>
        );
      case 'manquant':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5" />
            Pièce requise
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            <Clock className="w-3.5 h-3.5" />
            En attente de vérification
          </span>
        );
    }
  };

  const getProvenanceBadge = () => {
    if (document.provenance === 'recupere_administration') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
          <Building2 className="w-3 h-3" />
          Récupéré depuis l&apos;administration {document.isDemoApogee ? '(Démo APOGÉE)' : ''}
        </span>
      );
    }
    if (document.fileName) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
          <UserCheck className="w-3 h-3" />
          Fourni par le candidat
        </span>
      );
    }
    return null;
  };

  const hasPreviewableUrl = Boolean(document.fileUrl && document.fileUrl !== '#');

  return (
    <>
      <div
        className={`p-4 rounded-xl border transition-all ${
          document.status === 'rejete'
            ? 'border-rose-300 bg-rose-50/40'
            : document.status === 'complement_requis' || (document.isRequired && !document.fileName)
            ? 'border-amber-300 bg-amber-50/30'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">{document.label}</span>
              {document.isRequired && (
                <span className="text-[11px] font-medium text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                  Obligatoire
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {getStatusBadge()}
              {getProvenanceBadge()}
              {!document.fileName && (
                <span className="text-[11px]">Format max : 5 Mo (PDF, JPG, PNG, DOCX)</span>
              )}
            </div>
            {document.rejectionReason && (
              <div className="mt-1 text-xs text-rose-700 font-medium bg-rose-100/70 p-2 rounded-lg border border-rose-200">
                <strong>Motif :</strong> {document.rejectionReason}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {document.fileName ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg max-w-[190px] truncate border border-slate-200 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span className="truncate">{document.fileName}</span>
                </span>
                {hasPreviewableUrl && (
                  <>
                    <button
                      type="button"
                      onClick={handleConsult}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:text-teal-950 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      title="Consulter directement dans la plateforme"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Consulter</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      disabled={isDownloading}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                      title="Télécharger (action secondaire)"
                      aria-label={`Télécharger ${document.fileName}`}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                {!readOnly && (
                  <label className="cursor-pointer inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors shadow-xs whitespace-nowrap shrink-0">
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isUploading ? 'animate-spin' : ''}`} />
                    <span>{isUploading ? 'Envoi...' : 'Remplacer'}</span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.docx"
                      onChange={handleFileSelect}
                      disabled={isUploading}
                    />
                  </label>
                )}
              </div>
            ) : (
              !readOnly && (
                <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 px-3.5 py-2 rounded-lg transition-all shadow-xs whitespace-nowrap shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploading ? 'Chargement...' : 'Téléverser la pièce'}</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.docx"
                    onChange={handleFileSelect}
                    disabled={isUploading}
                  />
                </label>
              )
            )}
          </div>
        </div>

        {error && (
          <p className="mt-2 text-xs text-rose-600 font-medium flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {error}
          </p>
        )}
      </div>

      {!onPreview && (
        <DocumentViewerModal
          document={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </>
  );
};

