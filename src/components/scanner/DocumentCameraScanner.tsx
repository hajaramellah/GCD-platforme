import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Camera,
  RefreshCw,
  Upload,
  CheckCircle2,
  AlertCircle,
  Scan,
  Sparkles,
  VideoOff,
  Video,
  Settings2,
  RotateCw,
  Sliders,
  FileText,
  X
} from 'lucide-react';

interface DocumentCameraScannerProps {
  documentLabel: string;
  documentType: 'cin' | 'student-card';
  initialMode?: 'camera' | 'upload';
  onCaptureCompleted: (fileDataUrl: string) => void;
  isProcessing?: boolean;
}

interface VideoDevice {
  deviceId: string;
  label: string;
}

interface ImageQualityReport {
  width: number;
  height: number;
  brightness: number;
  sharpnessScore: number;
  isDark: boolean;
  isOverexposed: boolean;
  isBlurry: boolean;
  isPdf?: boolean;
  fileName?: string;
  message: string;
}

/**
 * Computes luminance and Laplacian variance (sharpness/blur estimate) from canvas ImageData
 */
function analyzeCanvasQuality(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): Omit<ImageQualityReport, 'message'> {
  const sampleW = Math.min(width, 480);
  const sampleH = Math.min(height, 360);
  const offCanvas = document.createElement('canvas');
  offCanvas.width = sampleW;
  offCanvas.height = sampleH;
  const offCtx = offCanvas.getContext('2d');
  if (!offCtx) {
    return {
      width,
      height,
      brightness: 128,
      sharpnessScore: 100,
      isDark: false,
      isOverexposed: false,
      isBlurry: false,
    };
  }
  offCtx.drawImage(ctx.canvas, 0, 0, sampleW, sampleH);
  const data = offCtx.getImageData(0, 0, sampleW, sampleH).data;

  const gray = new Float32Array(sampleW * sampleH);
  let totalLum = 0;
  for (let i = 0; i < sampleW * sampleH; i++) {
    const idx = i * 4;
    const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    gray[i] = lum;
    totalLum += lum;
  }
  const brightness = Math.round(totalLum / (sampleW * sampleH));

  // Discrete 3x3 Laplacian variance for blur detection
  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;
  for (let y = 1; y < sampleH - 1; y += 2) {
    for (let x = 1; x < sampleW - 1; x += 2) {
      const c = y * sampleW + x;
      const lap =
        gray[c - sampleW] +
        gray[c + sampleW] +
        gray[c - 1] +
        gray[c + 1] -
        4 * gray[c];
      lapSum += lap;
      lapSqSum += lap * lap;
      lapCount++;
    }
  }
  const mean = lapCount > 0 ? lapSum / lapCount : 0;
  const variance = lapCount > 0 ? lapSqSum / lapCount - mean * mean : 100;
  const sharpnessScore = Math.round(variance);

  return {
    width,
    height,
    brightness,
    sharpnessScore,
    isDark: brightness < 45,
    isOverexposed: brightness > 232,
    isBlurry: sharpnessScore < 40,
  };
}

function buildQualityMessage(q: Omit<ImageQualityReport, 'message'>): string {
  const warnings: string[] = [];
  if (q.isBlurry) warnings.push('netteté faible (risque de flou)');
  if (q.isDark) warnings.push('éclairage sombre');
  if (q.isOverexposed) warnings.push('reflet ou surexposition');
  if (warnings.length === 0) {
    return 'Luminosité et netteté satisfaisantes pour l\'extraction OCR.';
  }
  return `Attention (${warnings.join(', ')}). Utilisez l'amélioration de contraste ou reprenez une photo plus nette si nécessaire.`;
}

export const DocumentCameraScanner: React.FC<DocumentCameraScannerProps> = ({
  documentLabel,
  documentType,
  initialMode = 'camera',
  onCaptureCompleted,
  isProcessing = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<'camera' | 'upload'>(initialMode);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedPdfName, setCapturedPdfName] = useState<string | null>(null);
  const [rotationDeg, setRotationDeg] = useState<number>(0);
  const [contrastEnhanced, setContrastEnhanced] = useState<boolean>(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<
    'permission' | 'not_found' | 'busy' | 'unsupported' | 'security' | 'general' | null
  >(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isVideoReady, setIsVideoReady] = useState<boolean>(false);
  const [availableDevices, setAvailableDevices] = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [imageQuality, setImageQuality] = useState<ImageQualityReport | null>(null);

  // Stop active stream cleanly
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping track:', e);
        }
      });
      streamRef.current = null;
    }
    setStream(null);
    setIsCameraActive(false);
    setIsVideoReady(false);
    setVideoDimensions(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Re-render canvas with rotation & contrast enhancement
  const renderTransformedImage = useCallback(
    (sourceDataUrl: string, rot: number, enhance: boolean) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 1280;
        const h = img.naturalHeight || 720;
        const swap = rot % 180 !== 0;
        const canvas = document.createElement('canvas');
        canvas.width = swap ? h : w;
        canvas.height = swap ? w : h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rot * Math.PI) / 180);
        if (enhance) {
          ctx.filter = 'contrast(1.28) brightness(1.06) saturate(1.05)';
        }
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();

        const metrics = analyzeCanvasQuality(ctx, canvas.width, canvas.height);
        setImageQuality({
          ...metrics,
          message: buildQualityMessage(metrics),
        });

        setCapturedImage(canvas.toDataURL('image/jpeg', 0.94));
      };
      img.src = sourceDataUrl;
    },
    []
  );

  // Process uploaded image or PDF file cleanly (no window.alert)
  const processUploadedFile = (file: File) => {
    setFileError(null);
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (!isImage && !isPdf) {
      setFileError('Format non pris en charge. Veuillez importer un fichier JPG, JPEG, PNG ou PDF.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFileError('Le fichier dépasse la taille maximale autorisée de 10 Mo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      stopCamera();
      setRotationDeg(0);
      setContrastEnhanced(false);

      if (isPdf) {
        setCapturedPdfName(file.name);
        setOriginalImage(result);
        setCapturedImage(result);
        setImageQuality({
          width: 0,
          height: 0,
          brightness: 128,
          sharpnessScore: 100,
          isDark: false,
          isOverexposed: false,
          isBlurry: false,
          isPdf: true,
          fileName: file.name,
          message: `Document PDF « ${file.name} » (${Math.round(file.size / 1024)} Ko) prêt pour l'extraction OCR.`,
        });
      } else {
        setCapturedPdfName(null);
        setOriginalImage(result);
        renderTransformedImage(result, 0, false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  // Enumerate all available video devices
  const updateDeviceList = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Caméra ${index + 1} (${d.deviceId ? d.deviceId.slice(0, 5) : 'par défaut'})`,
        }));
      setAvailableDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.warn('Erreur lors de la détection des caméras:', err);
    }
  }, [selectedDeviceId]);

  // Progressive camera initialization with automatic constraint fallbacks
  const startCamera = useCallback(
    async (targetDeviceId?: string) => {
      stopCamera();
      setCameraError(null);
      setFileError(null);
      setErrorType(null);
      setIsStarting(true);

      const deviceIdToUse = targetDeviceId || selectedDeviceId;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsStarting(false);
        setErrorType('unsupported');
        setCameraError(
          "L'API caméra n'est pas prise en charge par ce navigateur ou est bloquée. Utilisez Chrome/Edge/Firefox sous HTTPS ou importez un fichier JPG/PNG/PDF."
        );
        return;
      }

      if (window.isSecureContext === false && window.location.hostname !== 'localhost') {
        setIsStarting(false);
        setErrorType('security');
        setCameraError(
          "L'accès à la caméra physique nécessite un contexte sécurisé HTTPS."
        );
        return;
      }

      let mediaStream: MediaStream | null = null;
      const constraintPlans: MediaStreamConstraints[] = [
        deviceIdToUse
          ? {
              video: {
                deviceId: { exact: deviceIdToUse },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            }
          : {
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            },
        deviceIdToUse
          ? { video: { deviceId: { exact: deviceIdToUse } }, audio: false }
          : { video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false },
        { video: true, audio: false },
      ];

      let lastError: any = null;
      for (const constraints of constraintPlans) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
          if (mediaStream) break;
        } catch (err: any) {
          lastError = err;
          if (
            err.name === 'NotAllowedError' ||
            err.name === 'PermissionDeniedError' ||
            err.name === 'NotReadableError' ||
            err.name === 'TrackStartError'
          ) {
            break;
          }
        }
      }

      setIsStarting(false);

      if (!mediaStream) {
        const errName = lastError?.name || '';
        const errMsg = lastError?.message || '';

        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          setErrorType('permission');
          setCameraError(
            "Autorisation d'accès à la caméra refusée par le navigateur. Autorisez la caméra dans la barre d'adresse ou utilisez l'importation de fichier."
          );
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setErrorType('not_found');
          setCameraError(
            "Aucune webcam détectée sur votre appareil. Vous pouvez importer directement un scan (JPG, PNG, PDF)."
          );
        } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
          setErrorType('busy');
          setCameraError(
            'La caméra est déjà utilisée par une autre application (Meet, Zoom, Teams...). Fermez-la puis réessayez.'
          );
        } else if (errName === 'SecurityError') {
          setErrorType('security');
          setCameraError(
            "L'accès à la caméra est bloqué par la politique de sécurité du navigateur."
          );
        } else {
          setErrorType('general');
          setCameraError(
            `Impossible d'activer la caméra (${errMsg || errName || 'Erreur'}). Vous pouvez importer une image ou un PDF.`
          );
        }
        setIsCameraActive(false);
        return;
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setIsCameraActive(true);
      updateDeviceList();

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = mediaStream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video
          .play()
          .then(() => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
              setIsVideoReady(true);
            }
          })
          .catch(() => undefined);
      }
    },
    [selectedDeviceId, stopCamera, updateDeviceList]
  );

  useEffect(() => {
    if (videoRef.current && stream) {
      const video = videoRef.current;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video
        .play()
        .then(() => {
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
            setIsVideoReady(true);
          }
        })
        .catch(() => undefined);
    }
  }, [stream]);

  const handleVideoMetadataLoaded = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
        setIsVideoReady(true);
      }
    }
  };

  useEffect(() => {
    setMode(initialMode);
    if (initialMode === 'camera') {
      updateDeviceList();
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [initialMode]);

  const handleModeSwitch = (nextMode: 'camera' | 'upload') => {
    setMode(nextMode);
    setFileError(null);
    if (nextMode === 'camera') {
      if (!capturedImage) {
        updateDeviceList();
        startCamera();
      }
    } else {
      stopCamera();
    }
  };

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDeviceId = e.target.value;
    setSelectedDeviceId(newDeviceId);
    startCamera(newDeviceId);
  };

  const handleCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setCapturedPdfName(null);
      setRotationDeg(0);
      setContrastEnhanced(false);
      setOriginalImage(dataUrl);

      const metrics = analyzeCanvasQuality(ctx, width, height);
      setImageQuality({
        ...metrics,
        message: buildQualityMessage(metrics),
      });

      setCapturedImage(dataUrl);
      stopCamera();
    }
  };

  const handleRotate = () => {
    if (!originalImage || capturedPdfName) return;
    const nextRot = (rotationDeg + 90) % 360;
    setRotationDeg(nextRot);
    renderTransformedImage(originalImage, nextRot, contrastEnhanced);
  };

  const handleToggleEnhance = () => {
    if (!originalImage || capturedPdfName) return;
    const nextEnhance = !contrastEnhanced;
    setContrastEnhanced(nextEnhance);
    renderTransformedImage(originalImage, rotationDeg, nextEnhance);
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setOriginalImage(null);
    setCapturedPdfName(null);
    setImageQuality(null);
    setRotationDeg(0);
    setContrastEnhanced(false);
    setFileError(null);
    if (mode === 'camera') {
      startCamera();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleConfirmAndProcess = () => {
    if (capturedImage) {
      onCaptureCompleted(capturedImage);
    }
  };

  return (
    <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white space-y-6 shadow-xl border border-slate-800">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-teal-400 bg-teal-500/10 border border-teal-500/30 px-3 py-1 rounded-full text-xs font-semibold">
            <Scan className="w-3.5 h-3.5" />
            {mode === 'camera' ? 'Scanner Caméra Haute Définition' : 'Importation de Document Numérisé'}
          </div>
          <h3 className="text-lg sm:text-xl font-bold mt-2">
            Numérisation de {documentLabel}
          </h3>
          <p className="text-xs text-slate-400">
            {mode === 'camera'
              ? 'Cadrez la carte à plat dans le rectangle, vérifiez la netteté et évitez les reflets.'
              : 'Importez une image claire (JPG, JPEG, PNG) ou un fichier PDF de votre document.'}
          </p>
        </div>

        {/* Mode switch & Camera selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-800 p-1 rounded-xl border border-slate-700 flex items-center text-xs">
            <button
              type="button"
              onClick={() => handleModeSwitch('camera')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
                mode === 'camera' ? 'bg-teal-500 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Caméra</span>
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('upload')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
                mode === 'upload' ? 'bg-teal-500 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Importer fichier</span>
            </button>
          </div>

          {mode === 'camera' && availableDevices.length > 1 && !capturedImage && (
            <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200">
              <Settings2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <select
                value={selectedDeviceId}
                onChange={handleDeviceChange}
                className="bg-transparent border-none text-xs text-slate-200 focus:outline-hidden font-medium cursor-pointer"
                title="Choisir la caméra"
              >
                {availableDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId} className="bg-slate-900 text-white">
                    {d.label || `Caméra ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === 'camera' && !capturedImage && (
            isCameraActive ? (
              <button
                type="button"
                onClick={stopCamera}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 transition-colors"
              >
                <VideoOff className="w-4 h-4 text-rose-400" />
                <span className="hidden sm:inline">Arrêter</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startCamera()}
                disabled={isStarting}
                className="p-2.5 bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
              >
                <Video className="w-4 h-4" />
                <span>{isStarting ? 'Démarrage...' : 'Démarrer'}</span>
              </button>
            )
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      </div>

      {/* Inline File Validation Error */}
      {fileError && (
        <div className="p-3.5 bg-rose-950/60 border border-rose-700 rounded-2xl text-xs text-rose-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{fileError}</span>
          </div>
          <button type="button" onClick={() => setFileError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Viewport Container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative aspect-video max-w-2xl mx-auto rounded-2xl overflow-hidden bg-black border-2 transition-colors flex items-center justify-center ${
          isDragging ? 'border-teal-400 ring-4 ring-teal-400/30' : 'border-slate-700'
        }`}
      >
        {isDragging && (
          <div className="absolute inset-0 bg-teal-950/90 z-20 flex flex-col items-center justify-center gap-3 backdrop-blur-xs text-white pointer-events-none">
            <Upload className="w-12 h-12 text-teal-400 animate-bounce" />
            <p className="text-sm font-bold">Déposez votre document ici</p>
            <p className="text-xs text-teal-200">Formats acceptés : JPG, JPEG, PNG, PDF</p>
          </div>
        )}

        {/* State 1: Captured Image or PDF Preview */}
        {capturedImage ? (
          <div className="relative w-full h-full flex items-center justify-center bg-slate-950">
            {capturedPdfName ? (
              <div className="text-center space-y-3 p-6">
                <div className="w-16 h-16 rounded-2xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center mx-auto text-teal-300">
                  <FileText className="w-8 h-8" />
                </div>
                <div className="font-bold text-sm text-white">{capturedPdfName}</div>
                <p className="text-xs text-slate-400 max-w-sm">
                  Fichier PDF chargé avec succès. Cliquez sur « Lancer la reconnaissance OCR » pour extraire les informations visibles.
                </p>
              </div>
            ) : (
              <img
                src={capturedImage}
                alt="Capture du document"
                className="w-full h-full object-contain"
              />
            )}

            {/* Quality Badges */}
            <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
              <div className="bg-emerald-500 text-slate-950 font-bold px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 shadow-md">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-950" />
                Prêt
              </div>
              {imageQuality && !imageQuality.isPdf && (
                <div
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border shadow-md ${
                    imageQuality.isDark || imageQuality.isOverexposed || imageQuality.isBlurry
                      ? 'bg-amber-500/95 text-slate-950 border-amber-400'
                      : 'bg-slate-900/85 text-teal-300 border-teal-500/40'
                  }`}
                >
                  {imageQuality.width}×{imageQuality.height} px •{' '}
                  {imageQuality.isBlurry
                    ? 'Flou détecté'
                    : imageQuality.isDark
                    ? 'Trop sombre'
                    : imageQuality.isOverexposed
                    ? 'Reflet'
                    : 'Netteté optimale'}
                </div>
              )}
            </div>

            {/* Image Editing Controls (Rotation & Contrast) */}
            {!capturedPdfName && (
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleRotate}
                  className="bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-600 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 shadow-md"
                  title="Pivoter de 90°"
                >
                  <RotateCw className="w-3.5 h-3.5 text-teal-400" />
                  <span>90°</span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleEnhance}
                  className={`border px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 shadow-md transition-colors ${
                    contrastEnhanced
                      ? 'bg-teal-500 text-slate-950 border-teal-400 font-bold'
                      : 'bg-slate-900/90 hover:bg-slate-800 text-white border-slate-600'
                  }`}
                  title="Améliorer le contraste pour l'OCR"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{contrastEnhanced ? 'Contraste +' : 'Contraste'}</span>
                </button>
              </div>
            )}

            {imageQuality && (
              <div className="absolute bottom-3 left-3 right-3 bg-slate-950/90 backdrop-blur-xs p-2.5 rounded-xl text-[11px] text-slate-200 text-center border border-white/10 shadow-lg">
                {imageQuality.message}
              </div>
            )}
          </div>
        ) : mode === 'upload' ? (
          /* Upload-first dropzone mode */
          <div className="p-8 text-center space-y-4 max-w-md">
            <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto text-teal-400 border border-slate-700">
              <Upload className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-white">
                Importez votre {documentLabel}
              </p>
              <p className="text-xs text-slate-400">
                Glissez-déposez un fichier ici ou sélectionnez depuis votre ordinateur / mobile (JPG, JPEG, PNG ou PDF).
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>Choisir un fichier (JPG, PNG, PDF)</span>
              </button>
            </div>
          </div>
        ) : (
          /* Camera Preview Mode */
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={handleVideoMetadataLoaded}
              onCanPlay={handleVideoMetadataLoaded}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                isCameraActive && isVideoReady ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
              }`}
            />

            {isCameraActive && isVideoReady && (
              <>
                <div className="absolute inset-8 sm:inset-12 border-2 border-dashed border-teal-400/90 rounded-2xl pointer-events-none flex flex-col justify-between p-4 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
                  <div className="flex justify-between items-center text-[11px] font-mono text-teal-300 font-bold bg-slate-950/80 px-2.5 py-1 rounded-md self-start border border-teal-500/30">
                    <span>
                      {documentType === 'cin' ? 'CARTE NATIONALE (CIN)' : "CARTE D'ÉTUDIANT / ATTESTATION"}
                    </span>
                  </div>
                  <div className="text-center text-xs text-white/95 bg-slate-950/80 py-1.5 px-4 rounded-xl self-center border border-white/10 shadow-sm">
                    Alignez la carte complète dans le cadre lumineux
                  </div>
                </div>

                <div className="absolute top-4 right-4 bg-slate-950/80 backdrop-blur-xs px-3 py-1 rounded-full border border-teal-500/40 flex items-center gap-2 text-[11px] text-teal-300 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    Caméra active{' '}
                    {videoDimensions ? `${videoDimensions.width}×${videoDimensions.height}` : 'HD'}
                  </span>
                </div>
              </>
            )}

            {isStarting && (
              <div className="p-8 text-center space-y-3 max-w-md">
                <RefreshCw className="w-8 h-8 text-teal-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-300 font-semibold">
                  Connexion à la caméra de votre appareil en cours...
                </p>
              </div>
            )}

            {!isStarting && (!isCameraActive || !isVideoReady) && (
              <div className="p-6 text-center space-y-4 max-w-md">
                <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto text-teal-400 border border-slate-700">
                  {cameraError ? (
                    <AlertCircle className="w-7 h-7 text-rose-400" />
                  ) : (
                    <Camera className="w-7 h-7" />
                  )}
                </div>

                {cameraError ? (
                  <div className="space-y-3 bg-rose-950/40 border border-rose-800/60 p-4 rounded-2xl text-left">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-rose-200">
                          {errorType === 'permission'
                            ? 'Autorisation caméra requise'
                            : errorType === 'busy'
                            ? 'Caméra déjà utilisée'
                            : errorType === 'not_found'
                            ? 'Aucune caméra trouvée'
                            : errorType === 'security'
                            ? 'Contexte HTTPS requis'
                            : 'Caméra indisponible'}
                        </h4>
                        <p className="text-[11px] text-rose-300/90 leading-relaxed">
                          {cameraError}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startCamera()}
                        className="bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition-all flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Réessayer</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-slate-800 hover:bg-slate-700 text-teal-300 font-bold text-xs px-4 py-2 rounded-xl transition-all border border-slate-700 flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Importer fichier (JPG/PNG/PDF)</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-300">
                      Cliquez ci-dessous pour activer la caméra physique ou importer un document.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => startCamera()}
                        className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl transition-all inline-flex items-center gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Démarrer la caméra</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs px-4 py-2.5 rounded-xl transition-all border border-slate-700 inline-flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Importer un fichier</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Bottom Action Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-400 shrink-0" />
          <span>
            {capturedImage
              ? 'Vérifiez la lisibilité avant de lancer l\'extraction OCR.'
              : isCameraActive && isVideoReady
              ? 'Caméra prête : stabilisez la carte puis cliquez sur Capturer.'
              : 'Vous pourrez contrôler et modifier toutes les informations extraites à l\'étape suivante.'}
          </span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {capturedImage ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                disabled={isProcessing}
                className="flex-1 sm:flex-initial px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-colors"
              >
                {mode === 'camera' ? 'Reprendre la photo' : 'Changer de fichier'}
              </button>
              <button
                type="button"
                onClick={handleConfirmAndProcess}
                disabled={isProcessing}
                className="flex-1 sm:flex-initial px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-slate-950 rounded-xl text-xs font-black shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Analyse OCR en cours...</span>
                  </>
                ) : (
                  <>
                    <Scan className="w-4 h-4 text-slate-950" />
                    <span>Lancer la reconnaissance OCR →</span>
                  </>
                )}
              </button>
            </>
          ) : mode === 'camera' && isCameraActive && isVideoReady ? (
            <button
              type="button"
              onClick={handleCapture}
              className="w-full sm:w-auto px-8 py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-2xl text-xs font-black shadow-lg shadow-teal-500/25 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <Camera className="w-5 h-5 text-slate-950" />
              <span>Capturer le document</span>
            </button>
          ) : mode === 'camera' && !isCameraActive ? (
            <button
              type="button"
              onClick={() => startCamera()}
              disabled={isStarting}
              className="w-full sm:w-auto px-6 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" />
              <span>{isStarting ? 'Connexion...' : 'Activer la caméra'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto px-6 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Sélectionner un fichier</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
