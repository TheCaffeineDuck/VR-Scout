import { useState, useCallback, useRef } from 'react';
import { uploadChunk } from '../../api/upload';
import { ProgressBar } from '../common/ProgressBar';

interface VideoDropZoneProps {
  sceneId: string | null;
  onUploadComplete?: () => void;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

/** Drag-and-drop zone for video file upload */
export function VideoDropZone({ sceneId, onUploadComplete }: VideoDropZoneProps): React.JSX.Element {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (videoFile: File) => {
    if (!sceneId) {
      setError('Create a scene first before uploading');
      return;
    }

    setFile(videoFile);
    setError(null);
    setUploading(true);
    setProgress(0);

    const chunks = Math.ceil(videoFile.size / CHUNK_SIZE);
    setTotalChunks(chunks);

    try {
      for (let i = 0; i < chunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, videoFile.size);
        const blob = videoFile.slice(start, end);

        await uploadChunk({
          sceneId,
          chunkIndex: i,
          totalChunks: chunks,
          data: blob,
          filename: videoFile.name,
        });

        setProgress(i + 1);
      }
      onUploadComplete?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [sceneId, onUploadComplete]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && droppedFile.type.startsWith('video/')) {
        void handleUpload(droppedFile);
      } else {
        setError('Please drop a video file');
      }
    },
    [handleUpload],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) {
        void handleUpload(selected);
      }
    },
    [handleUpload],
  );

  return (
    <div className="space-y-3">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          dragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-gray-600 hover:border-gray-500'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        {file ? (
          <div className="text-gray-300">
            <p className="font-medium">{file.name}</p>
            <p className="text-sm text-gray-500">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
          </div>
        ) : (
          <div className="text-gray-400">
            <p className="text-lg mb-1">Drop video file here</p>
            <p className="text-sm">or click to browse</p>
          </div>
        )}
      </div>

      {uploading && (
        <ProgressBar value={progress} max={totalChunks} label="Uploading" />
      )}

      {!uploading && file && progress === totalChunks && totalChunks > 0 && (
        <p className="text-sm text-green-400">Upload complete</p>
      )}

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
