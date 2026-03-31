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

export async function uploadChunk(_params: UploadChunkParams): Promise<void> {
  // TODO: not implemented
  throw new Error('TODO: not implemented');
}

export async function uploadSupplementary(
  _params: UploadSupplementaryParams,
): Promise<void> {
  // TODO: not implemented
  throw new Error('TODO: not implemented');
}
