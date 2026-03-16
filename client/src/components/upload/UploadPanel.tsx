import { useState, useRef, useCallback } from 'react';
import { createScene, deleteSceneVideo, deleteSrt, uploadFileChunked, uploadSrt } from '../../api/client.ts';
import type { UploadProgress } from '../../api/client.ts';
import type { SrtUploadResponse } from '../../types/pipeline.ts';
import { UPLOAD_ACCEPTED_TYPES, UPLOAD_MAX_SIZE, UPLOAD_WARN_SIZE } from '../../utils/constants.ts';
import { formatFileSize, formatPercent } from '../../utils/format.ts';
import './UploadPanel.css';

const SRT_MAX_SIZE = 10 * 1024 * 1024; // 10 MB

/** Derive a URL-safe scene ID from a video filename: "Library Area.MP4" → "Library_Area" */
function sceneIdFromFile(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  // Replace non-alphanumeric (except - and _) with underscore, collapse runs, trim edges
  return base
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || `scene_${Date.now()}`;
}

/** Derive a human-readable scene name from a video filename: "library_area.MP4" → "library_area" */
function sceneNameFromFile(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

interface UploadPanelProps {
  sceneId: string;
  isExistingScene: boolean;
  onSceneIdResolved: (id: string) => void;
  onUploadComplete: () => void;
}

export function UploadPanel({ sceneId, isExistingScene, onSceneIdResolved, onUploadComplete }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [videoRemoved, setVideoRemoved] = useState(false);
  const [removingVideo, setRemovingVideo] = useState(false);
  const [removeResult, setRemoveResult] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // SRT sidecar state
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [srtUploading, setSrtUploading] = useState(false);
  const [srtResult, setSrtResult] = useState<SrtUploadResponse | null>(null);
  const [srtError, setSrtError] = useState<string | null>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((f: File): string | null => {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase();
    if (!UPLOAD_ACCEPTED_TYPES.includes(ext)) {
      return `Invalid file type "${ext}". Accepted: ${UPLOAD_ACCEPTED_TYPES.join(', ')}`;
    }
    if (f.size > UPLOAD_MAX_SIZE) {
      return `File is ${formatFileSize(f.size)} — maximum is ${formatFileSize(UPLOAD_MAX_SIZE)}.`;
    }
    return null;
  }, []);

  const handleFileSelect = useCallback(
    (f: File) => {
      const err = validateFile(f);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      setFile(f);
      setProgress(null);
      // If no scene ID yet, derive one from the filename
      if (!sceneId) {
        onSceneIdResolved(sceneIdFromFile(f.name));
      }
    },
    [validateFile, sceneId, onSceneIdResolved],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFileSelect(f);
    },
    [handleFileSelect],
  );

  const handleUpload = useCallback(async () => {
    if (!file || !sceneId) return;
    setUploading(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Create the scene in the database before uploading chunks
      const sceneName = sceneNameFromFile(file.name);
      await createScene({ id: sceneId, name: sceneName });

      await uploadFileChunked(
        sceneId,
        file,
        (p) => setProgress(p),
        controller.signal,
      );
      onUploadComplete();
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Upload cancelled.');
      } else {
        setError(err instanceof Error ? err.message : 'Upload failed.');
      }
    } finally {
      setUploading(false);
      abortRef.current = null;
    }
  }, [file, sceneId, onUploadComplete]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleRemoveVideo = useCallback(async () => {
    if (!sceneId) return;
    setRemovingVideo(true);
    setError(null);
    setRemoveResult(null);
    try {
      const res = await deleteSceneVideo(sceneId);
      setVideoRemoved(true);
      setRemoveResult(`Video removed — freed ${res.freed_mb} MB`);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('No video file found')) {
        setVideoRemoved(true);
        setRemoveResult('No video file on disk.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to remove video.');
      }
    } finally {
      setRemovingVideo(false);
    }
  }, [sceneId]);

  // ── SRT handlers ──────────────────────────────────────────────

  const handleSrtSelect = useCallback((f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext !== 'srt') {
      setSrtError('File must be a .srt subtitle file.');
      return;
    }
    if (f.size > SRT_MAX_SIZE) {
      setSrtError(`SRT file is ${formatFileSize(f.size)} — maximum is 10 MB.`);
      return;
    }
    setSrtError(null);
    setSrtFile(f);
    setSrtResult(null);

    // Auto-upload if scene exists
    if (sceneId) {
      void handleSrtUpload(f);
    }
  }, [sceneId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSrtUpload = useCallback(async (f?: File) => {
    const srt = f ?? srtFile;
    if (!srt || !sceneId) return;
    setSrtUploading(true);
    setSrtError(null);

    try {
      const result = await uploadSrt(sceneId, srt);
      setSrtResult(result);
    } catch (err: unknown) {
      setSrtError(err instanceof Error ? err.message : 'SRT upload failed.');
      setSrtResult(null);
    } finally {
      setSrtUploading(false);
    }
  }, [srtFile, sceneId]);

  const handleSrtRemove = useCallback(async () => {
    setSrtFile(null);
    setSrtResult(null);
    setSrtError(null);
    if (sceneId) {
      try {
        await deleteSrt(sceneId);
      } catch {
        // Silently ignore — file may not have been uploaded yet
      }
    }
  }, [sceneId]);

  const handleSrtDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) handleSrtSelect(f);
    },
    [handleSrtSelect],
  );

  const sizeWarning = file && file.size > UPLOAD_WARN_SIZE;
  const pct = progress ? progress.loaded / progress.total : 0;
  const showRemoveVideo = isExistingScene && !videoRemoved && !uploading;
  const showSrtSection = sceneId.length > 0;

  return (
    <div className="upload-panel">
      <h3>Upload Video</h3>

      {showRemoveVideo && (
        <div className="upload-panel__existing-video">
          <span className="upload-panel__existing-label">
            Raw video: <strong>{sceneId}.mp4</strong>
          </span>
          <button
            className="btn btn--danger btn--small"
            disabled={removingVideo}
            onClick={() => void handleRemoveVideo()}
          >
            {removingVideo ? 'Removing...' : 'Remove Video'}
          </button>
        </div>
      )}

      {removeResult && (
        <div className="upload-panel__info">{removeResult}</div>
      )}

      <div
        className={`upload-panel__dropzone ${dragOver ? 'upload-panel__dropzone--active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={UPLOAD_ACCEPTED_TYPES.join(',')}
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
          }}
        />
        {file ? (
          <div className="upload-panel__file-info">
            <div className="upload-panel__file-name">{file.name}</div>
            <div className="upload-panel__file-size">{formatFileSize(file.size)}</div>
          </div>
        ) : (
          <div className="upload-panel__dropzone-text">
            <div className="upload-panel__dropzone-icon">&#x1F4E4;</div>
            <p>Drag and drop a video file here, or click to browse</p>
            <p className="upload-panel__dropzone-hint">
              .mp4, .mov, .avi — up to 20 GB
            </p>
          </div>
        )}
      </div>

      {sizeWarning && (
        <div className="upload-panel__warning">
          Large file ({formatFileSize(file.size)}) — upload may take a while.
        </div>
      )}

      {error && <div className="upload-panel__error">{error}</div>}

      {uploading && progress && (
        <div className="upload-panel__progress">
          <div className="upload-panel__progress-bar">
            <div
              className="upload-panel__progress-fill"
              style={{ width: formatPercent(pct, 0) }}
            />
          </div>
          <div className="upload-panel__progress-text">
            {formatPercent(pct, 1)} — {formatFileSize(progress.loaded)} / {formatFileSize(progress.total)}
            <span className="upload-panel__progress-chunks">
              Chunk {progress.chunkIndex} / {progress.totalChunks}
            </span>
          </div>
        </div>
      )}

      <div className="upload-panel__actions">
        {!uploading ? (
          <button
            className="btn btn--primary"
            disabled={!file || !sceneId}
            onClick={() => void handleUpload()}
          >
            Upload
          </button>
        ) : (
          <button className="btn btn--danger" onClick={handleCancel}>
            Cancel Upload
          </button>
        )}
      </div>

      {/* ── Optional SRT Sidecar Upload ────────────────────────── */}
      {showSrtSection && (
        <div className="upload-panel__srt-section">
          <div className="upload-panel__srt-header">
            <span className="upload-panel__srt-title">Optional: DJI Telemetry</span>
          </div>

          {!srtFile && !srtResult && (
            <div
              className="upload-panel__srt-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleSrtDrop}
              onClick={() => srtInputRef.current?.click()}
            >
              <input
                ref={srtInputRef}
                type="file"
                accept=".srt"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleSrtSelect(f);
                }}
              />
              <span className="upload-panel__srt-add">+ Add SRT file</span>
              <span className="upload-panel__srt-hint">
                DJI subtitle file with GPS &amp; gimbal data
              </span>
            </div>
          )}

          {srtUploading && (
            <div className="upload-panel__srt-info">
              Uploading {srtFile?.name}...
            </div>
          )}

          {srtResult && srtFile && (
            <div className="upload-panel__srt-result">
              <div className="upload-panel__srt-result-info">
                <span className="upload-panel__srt-check">{'\u2705'}</span>
                <span className="upload-panel__srt-filename">{srtFile.name}</span>
                <span className="upload-panel__srt-summary">
                  {srtResult.entry_count.toLocaleString()} entries
                  {' \u00B7 '}GPS: {srtResult.has_gps ? 'Yes' : 'No'}
                  {' \u00B7 '}Gimbal: {srtResult.has_gimbal ? 'Yes' : 'No'}
                </span>
              </div>
              <button
                className="btn btn--small btn--ghost"
                onClick={() => void handleSrtRemove()}
                title="Remove SRT file"
              >
                {'\u2715'}
              </button>
            </div>
          )}

          {srtError && (
            <div className="upload-panel__srt-error">{srtError}</div>
          )}
        </div>
      )}
    </div>
  );
}
