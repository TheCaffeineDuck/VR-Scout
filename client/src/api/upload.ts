import { API_BASE, ApiError } from './client';

export interface UploadChunkParams {
  sceneId: string;
  chunkIndex: number;
  totalChunks: number;
  data: Blob;
  filename: string;
}

export interface UploadSupplementaryParams {
  sceneId: string;
  fileType: 'srt' | 'photo360';
  data: File;
}

export async function uploadChunk(params: UploadChunkParams): Promise<void> {
  const formData = new FormData();
  formData.append('file', params.data);

  const response = await fetch(`${API_BASE}/upload/chunk`, {
    method: 'POST',
    headers: {
      'x-scene-id': params.sceneId,
      'x-chunk-index': String(params.chunkIndex),
      'x-total-chunks': String(params.totalChunks),
      'x-filename': params.filename,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
}

export async function uploadSupplementary(
  params: UploadSupplementaryParams,
): Promise<void> {
  const formData = new FormData();
  formData.append('file', params.data);

  const response = await fetch(
    `${API_BASE}/upload/${params.fileType}?scene_id=${params.sceneId}`,
    {
      method: 'POST',
      body: formData,
    },
  );

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
}
