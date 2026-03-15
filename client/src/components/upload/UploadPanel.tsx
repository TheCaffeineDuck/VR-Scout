import { useState, useRef, useCallback } from 'react';
import { uploadFileChunked } from '../../api/client.ts';
import type { UploadProgress } from '../../api/client.ts';
import { UPLOAD_ACCEPTED_TYPES, UPLOAD_MAX_SIZE, UPLOAD_WARN_SIZE } from '../../utils/constants.ts';
import { formatFileSize, formatPercent } from '../../utils/format.ts';
import './UploadPanel.css';

interface UploadPanelProps {
  sceneId: string;
  onUploadComplete: () => void;
}

export function UploadPanel({ sceneId, onUploadComplete }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    },
    [validateFile],
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
    if (!file) return;
    setUploading(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
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

  const sizeWarning = file && file.size > UPLOAD_WARN_SIZE;
  const pct = progress ? progress.loaded / progress.total : 0;

  return (
    <div className="upload-panel">
      <h3>Upload Video</h3>

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
            disabled={!file}
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
    </div>
  );
}
