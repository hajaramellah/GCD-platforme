import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  Building2,
  UserCheck,
  FileWarning,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  loadProtectedDocument,
  LoadedProtectedDocument,
  ViewableDocumentInput,
} from '../../services/documentService';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface DocumentViewerModalProps {
  document: ViewableDocumentInput | null;
  onClose: () => void;
  allowDownload?: boolean;
  footerActions?: React.ReactNode;
}

const ALLOWED_DOCX_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'blockquote',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'br',
  'hr',
  'span',
  'div',
  'sub',
  'sup',
  'a',
  'img',
]);

function renderSafeDocxNode(node: ChildNode, key: string): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (!ALLOWED_DOCX_TAGS.has(tag)) {
    return Array.from(el.childNodes).map((child, idx) =>
      renderSafeDocxNode(child, `${key}-${idx}`)
    );
  }

  const children = Array.from(el.childNodes).map((child, idx) =>
    renderSafeDocxNode(child, `${key}-${idx}`)
  );

  if (tag === 'br') return <br key={key} />;
  if (tag === 'hr') return <hr key={key} className="my-4 border-slate-200" />;

  if (tag === 'img') {
    const src = el.getAttribute('src') || '';
    const alt = el.getAttribute('alt') || 'Image intégrée';
    if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(src)) {
      return null;
    }
    return (
      <img
        key={key}
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        className="max-w-full h-auto my-3 rounded border border-slate-200"
      />
    );
  }

  if (tag === 'a') {
    const href = el.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) {
      return <span key={key}>{children}</span>;
    }
    return (
      <a
        key={key}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-teal-700 underline hover:text-teal-900"
      >
        {children}
      </a>
    );
  }

  const classMap: Record<string, string> = {
    h1: 'text-xl font-bold text-slate-900 mt-4 mb-2',
    h2: 'text-lg font-bold text-slate-900 mt-4 mb-2',
    h3: 'text-base font-bold text-slate-800 mt-3 mb-1.5',
    h4: 'text-sm font-semibold text-slate-800 mt-3 mb-1',
    p: 'text-sm text-slate-700 leading-relaxed mb-2.5',
    ul: 'list-disc pl-6 mb-3 space-y-1 text-sm text-slate-700',
    ol: 'list-decimal pl-6 mb-3 space-y-1 text-sm text-slate-700',
    li: 'leading-relaxed',
    blockquote: 'pl-4 py-1 my-3 border-l-2 border-slate-300 text-slate-600 italic text-sm',
    table: 'w-full border-collapse border border-slate-300 my-4 text-xs',
    th: 'border border-slate-300 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-800',
    td: 'border border-slate-300 px-3 py-2 text-slate-700 align-top',
    pre: 'bg-slate-100 p-3 rounded text-xs font-mono overflow-x-auto my-3',
    code: 'bg-slate-100 px-1 py-0.5 rounded text-xs font-mono',
  };

  return React.createElement(
    tag,
    {
      key,
      className: classMap[tag] || undefined,
    },
    children
  );
}

function renderSanitizedDocxHtml(html: string): React.ReactNode {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, 'text/html');
  return Array.from(parsed.body.childNodes).map((node, idx) =>
    renderSafeDocxNode(node, `docx-${idx}`)
  );
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  document: docMeta,
  onClose,
  allowDownload = true,
  footerActions,
}) => {
  const { currentUser, currentRole, sessionToken } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedProtectedDocument | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);

  // PDF state
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInput, setPageInput] = useState<string>('1');
  const [pdfRendering, setPdfRendering] = useState<boolean>(false);
  const [pdfRenderError, setPdfRenderError] = useState<string | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const pageContainerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  // DOCX state
  const [docxNodes, setDocxNodes] = useState<React.ReactNode>(null);

  // Escape key handler
  useEffect(() => {
    if (!docMeta) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [docMeta, onClose]);

  // Fetch protected document bytes on open/change
  useEffect(() => {
    if (!docMeta) {
      setLoaded(null);
      setError(null);
      setNumPages(0);
      setCurrentPage(1);
      setPageInput('1');
      setDocxNodes(null);
      return;
    }

    let cancelled = false;
    let activeObjectUrl: string | null = null;

    const fetchDoc = async () => {
      setLoading(true);
      setError(null);
      setPdfRenderError(null);
      setLoaded(null);
      setNumPages(0);
      setCurrentPage(1);
      setPageInput('1');
      setZoom(1.0);
      setDocxNodes(null);

      try {
        const result = await loadProtectedDocument(docMeta, {
          sessionToken,
          currentUserId: currentUser?.id,
          currentUserEmail: currentUser?.email,
          currentUserCin: currentUser?.cin,
          activeRole: currentRole,
        });

        if (cancelled) {
          URL.revokeObjectURL(result.objectUrl);
          return;
        }

        activeObjectUrl = result.objectUrl;
        setLoaded(result);

        if (result.kind === 'pdf') {
          const dataCopy = new Uint8Array(result.arrayBuffer.slice(0));
          const loadingTask = pdfjsLib.getDocument({ data: dataCopy });
          const pdfDoc = await loadingTask.promise;
          if (cancelled) {
            await (pdfDoc as unknown as { destroy?: () => Promise<void> }).destroy?.();
            return;
          }
          pdfDocRef.current = pdfDoc;
          canvasRefs.current = new Array(pdfDoc.numPages).fill(null);
          pageContainerRefs.current = new Array(pdfDoc.numPages).fill(null);
          setNumPages(pdfDoc.numPages);
          setCurrentPage(1);
          setPageInput('1');
        } else if (result.kind === 'docx') {
          const docxRes = await mammoth.convertToHtml({
            arrayBuffer: result.arrayBuffer.slice(0),
          });
          if (cancelled) return;
          setDocxNodes(renderSanitizedDocxHtml(docxRes.value || '<p>(Document vide)</p>'));
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.message ||
              'Une erreur est survenue lors du chargement sécurisé du document.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchDoc();

    return () => {
      cancelled = true;
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
      }
      if (pdfDocRef.current) {
        (pdfDocRef.current as unknown as { destroy?: () => Promise<void> })
          .destroy?.()
          .catch(() => undefined);
        pdfDocRef.current = null;
      }
    };
  }, [docMeta, sessionToken, currentUser?.id, currentUser?.email, currentUser?.cin, currentRole]);

  // Render all PDF pages when numPages or zoom changes
  useEffect(() => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc || numPages <= 0 || loaded?.kind !== 'pdf') return;

    let cancelled = false;
    const renderTasks: Array<{ cancel: () => void }> = [];

    const renderAllPages = async () => {
      setPdfRendering(true);
      setPdfRenderError(null);
      try {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const baseScale = 1.2 * zoom;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          if (cancelled) break;
          const canvas = canvasRefs.current[pageNum - 1];
          if (!canvas) continue;

          const page = await pdfDoc.getPage(pageNum);
          if (cancelled) break;

          const viewport = page.getViewport({ scale: baseScale });
          const renderViewport = page.getViewport({ scale: baseScale * dpr });

          canvas.width = Math.floor(renderViewport.width);
          canvas.height = Math.floor(renderViewport.height);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const task = page.render({
            canvasContext: ctx,
            viewport: renderViewport,
            canvas,
          });
          renderTasks.push(task);
          await task.promise;
        }
      } catch (err: any) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') {
          setPdfRenderError('Impossible de rendre certaines pages de ce fichier PDF.');
        }
      } finally {
        if (!cancelled) setPdfRendering(false);
      }
    };

    renderAllPages();

    return () => {
      cancelled = true;
      for (const task of renderTasks) {
        try {
          task.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [numPages, zoom, loaded?.kind]);

  const jumpToPage = useCallback(
    (target: number) => {
      if (numPages <= 0) return;
      const clamped = Math.max(1, Math.min(numPages, target));
      setCurrentPage(clamped);
      setPageInput(String(clamped));
      const container = pageContainerRefs.current[clamped - 1];
      if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [numPages]
  );

  const handleScrollPages = () => {
    const area = scrollAreaRef.current;
    if (!area || numPages <= 1) return;
    const areaTop = area.getBoundingClientRect().top;
    let closestPage = 1;
    let minDistance = Infinity;
    for (let i = 0; i < numPages; i++) {
      const el = pageContainerRefs.current[i];
      if (!el) continue;
      const dist = Math.abs(el.getBoundingClientRect().top - areaTop - 24);
      if (dist < minDistance) {
        minDistance = dist;
        closestPage = i + 1;
      }
    }
    if (closestPage !== currentPage) {
      setCurrentPage(closestPage);
      setPageInput(String(closestPage));
    }
  };

  const handleDownload = () => {
    if (!loaded || !allowDownload) return;
    const anchor = window.document.createElement('a');
    anchor.href = loaded.objectUrl;
    anchor.download = loaded.fileName || docMeta?.label || 'document';
    window.document.body.appendChild(anchor);
    anchor.click();
    window.document.body.removeChild(anchor);
  };

  if (!docMeta) return null;

  const canZoom =
    loaded &&
    (loaded.kind === 'pdf' || loaded.kind === 'image' || loaded.kind === 'docx');

  const formatLabel =
    loaded?.kind === 'pdf'
      ? 'PDF'
      : loaded?.kind === 'image'
      ? 'IMAGE'
      : loaded?.kind === 'docx'
      ? 'DOCX'
      : 'FICHIER';

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={`Aperçu du document : ${docMeta.label}`}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span>Consultation sécurisée intégrée</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-teal-300">{formatLabel}</span>
              {docMeta.provenance && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 truncate">
                    {docMeta.provenance === 'recupere_administration' ? (
                      <>
                        <Building2 className="w-3 h-3 text-teal-300 shrink-0" />
                        <span>Administration {docMeta.isDemoApogee ? '(Démo APOGÉE)' : ''}</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3 h-3 text-slate-300 shrink-0" />
                        <span>Fourni par le candidat</span>
                      </>
                    )}
                  </span>
                </>
              )}
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white truncate">
              {docMeta.label}
            </h3>
            {docMeta.fileName && (
              <div className="text-[11px] font-mono text-slate-400 truncate">
                {docMeta.fileName}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {allowDownload && loaded && (
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors whitespace-nowrap shrink-0"
                title="Télécharger une copie (action secondaire)"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Télécharger</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white text-slate-900 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
              aria-label="Fermer l'aperçu"
            >
              <X className="w-4 h-4" />
              <span>Fermer</span>
            </button>
          </div>
        </div>

        {/* Viewer Controls Toolbar */}
        {!loading && !error && loaded && (canZoom || loaded.kind === 'pdf') && (
          <div className="px-4 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
            {/* Page Navigation (PDF) */}
            {loaded.kind === 'pdf' && numPages > 0 ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => jumpToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium whitespace-nowrap shrink-0"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Précédent</span>
                </button>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const parsed = parseInt(pageInput, 10);
                    if (!Number.isNaN(parsed)) jumpToPage(parsed);
                  }}
                  className="inline-flex items-center gap-1.5 px-2 text-slate-700 font-mono tabular-nums"
                >
                  <span>Page</span>
                  <input
                    type="number"
                    min={1}
                    max={numPages}
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    onBlur={() => {
                      const parsed = parseInt(pageInput, 10);
                      if (!Number.isNaN(parsed)) jumpToPage(parsed);
                      else setPageInput(String(currentPage));
                    }}
                    aria-label="Numéro de page"
                    className="w-12 text-center py-1 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-900 tabular-nums"
                  />
                  <span>/ {numPages}</span>
                </form>

                <button
                  type="button"
                  onClick={() => jumpToPage(currentPage + 1)}
                  disabled={currentPage >= numPages}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium whitespace-nowrap shrink-0"
                >
                  <span>Suivant</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-600 font-medium">
                <FileText className="w-4 h-4 text-teal-700" />
                <span>
                  {loaded.kind === 'image'
                    ? 'Aperçu haute résolution'
                    : 'Document bureautique DOCX'}
                </span>
              </div>
            )}

            {/* Zoom Controls */}
            {canZoom && (
              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                  disabled={zoom <= 0.5}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  title="Réduire le zoom"
                  aria-label="Réduire le zoom"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                <span className="min-w-[54px] text-center font-mono font-semibold text-slate-800 tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>

                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))}
                  disabled={zoom >= 2.5}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  title="Agrandir le zoom"
                  aria-label="Agrandir le zoom"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setZoom(1.0)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 font-medium whitespace-nowrap shrink-0"
                  title="Réinitialiser le zoom à 100%"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>100%</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Main Viewport Canvas */}
        <div
          ref={scrollAreaRef}
          onScroll={handleScrollPages}
          className="flex-1 overflow-auto bg-slate-100 p-4 sm:p-6"
        >
          {loading && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-600">
              <Loader2 className="w-8 h-8 animate-spin text-teal-700" />
              <p className="text-sm font-medium">Chargement sécurisé du document...</p>
            </div>
          )}

          {!loading && error && (
            <div className="max-w-md mx-auto my-12 bg-white border border-rose-200 rounded-2xl p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">
                Consultation impossible
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">{error}</p>
            </div>
          )}

          {!loading && !error && loaded?.kind === 'pdf' && (
            <div className="flex flex-col items-center gap-5">
              {pdfRendering && (
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Rendu des pages en cours...</span>
                </div>
              )}

              {pdfRenderError && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-2 rounded-lg">
                  {pdfRenderError}
                </div>
              )}

              {Array.from({ length: numPages }, (_, idx) => {
                const pageNum = idx + 1;
                return (
                  <div
                    key={pageNum}
                    ref={(el) => {
                      pageContainerRefs.current[idx] = el;
                    }}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className="bg-white shadow-md border border-slate-200 rounded-lg overflow-hidden">
                      <canvas
                        ref={(el) => {
                          canvasRefs.current[idx] = el;
                        }}
                        className="block"
                      />
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                      Page {pageNum} sur {numPages}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !error && loaded?.kind === 'image' && (
            <div className="min-h-full flex items-center justify-center">
              <div className="bg-white p-3 rounded-xl shadow-md border border-slate-200 inline-block">
                <img
                  src={loaded.objectUrl}
                  alt={docMeta.label}
                  referrerPolicy="no-referrer"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: 'center center',
                  }}
                  className="max-w-full max-h-[72vh] object-contain transition-transform duration-150"
                />
              </div>
            </div>
          )}

          {!loading && !error && loaded?.kind === 'docx' && (
            <div
              className="mx-auto bg-white rounded-xl shadow-md border border-slate-200 p-6 sm:p-10 transition-all"
              style={{
                maxWidth: `${Math.round(760 * Math.max(0.85, zoom))}px`,
                fontSize: `${Math.round(14 * zoom)}px`,
              }}
            >
              {docxNodes}
            </div>
          )}

          {!loading && !error && loaded?.kind === 'unsupported' && (
            <div className="max-w-lg mx-auto my-12 bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
                <FileWarning className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-sm font-bold text-slate-900">
                  L&apos;aperçu intégré n&apos;est pas disponible pour ce format
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Le fichier <span className="font-mono font-semibold">{loaded.fileName}</span> ({loaded.mimeType || 'format non pris en charge'}) ne peut pas être affiché directement dans le navigateur. Les formats pris en charge pour l&apos;aperçu direct sont PDF, JPG, JPEG, PNG et DOCX.
                </p>
              </div>
              {allowDownload && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger le fichier</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Optional Footer Actions (e.g. Admin document validation) */}
        {footerActions && (
          <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
            {footerActions}
          </div>
        )}
      </div>
    </div>
  );
};
