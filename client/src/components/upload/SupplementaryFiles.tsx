import { useState, useRef } from 'react';
import { uploadSupplementary } from '../../api/upload';

interface SupplementaryFilesProps {
  sceneId: string | null;
}

interface FileSlot {
  file: File | null;
  uploading: boolean;
  uploaded: boolean;
  error: string | null;
}

/** Upload slots for SRT telemetry and 360 reference photos */
export function SupplementaryFiles({ sceneId }: SupplementaryFilesProps): React.JSX.Element {
  const [srt, setSrt] = useState<FileSlot>({ file: null, uploading: false, uploaded: false, error: null });
  const [photo360, setPhoto360] = useState<FileSlot>({ file: null, uploading: false, uploaded: false, error: null });
  const srtInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (
    file: File,
    fileType: 'srt' | 'photo360',
    setter: React.Dispatch<React.SetStateAction<FileSlot>>,
  ) => {
    if (!sceneId) {
      setter((prev) => ({ ...prev, error: 'Create a scene first' }));
      return;
    }
    setter({ file, uploading: true, uploaded: false, error: null });
    try {
      await uploadSupplementary({ sceneId, fileType, data: file });
      setter({ file, uploading: false, uploaded: true, error: null });
    } catch (err: unknown) {
      setter({
        file,
        uploading: false,
        uploaded: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  };

  const renderSlot = (
    label: string,
    accept: string,
    slot: FileSlot,
    setter: React.Dispatch<React.SetStateAction<FileSlot>>,
    fileType: 'srt' | 'photo360',
    inputRef: React.RefObject<HTMLInputElement | null>,
  ) => (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-300 mb-2">{label}</h4>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f, fileType, setter);
        }}
      />
      <button
        className="w-full py-2 px-3 border border-dashed border-gray-600 rounded-lg text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors"
        onClick={() => inputRef.current?.click()}
        disabled={slot.uploading}
      >
        {slot.uploading
          ? 'Uploading...'
          : slot.file
            ? slot.file.name
            : 'Choose file'}
      </button>
      {slot.uploaded && <p className="text-xs text-green-400 mt-1">Uploaded</p>}
      {slot.error && <p className="text-xs text-red-400 mt-1">{slot.error}</p>}
    </div>
  );

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Supplementary Files
      </h3>
      {renderSlot('SRT Telemetry', '.srt', srt, setSrt, 'srt', srtInputRef)}
      {renderSlot('360 Reference Photo', 'image/*', photo360, setPhoto360, 'photo360', photoInputRef)}
    </div>
  );
}
