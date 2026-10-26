import { extname } from 'node:path';
import { apiRequest, type ApiClientOptions } from './api-client';
import type { DatasetUploadResponse } from '@/types/analytics';

/**
 * Dataset files this package sends, by extension, and the content type each one goes as.
 * The engine also takes text/plain, which is how lexq_dataset_upload sends inline content.
 */
const DATASET_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.csv': 'text/csv',
  '.json': 'application/json',
};

/** The content type for a dataset file name, or undefined unless it ends in .csv or .json. */
export function datasetContentType(filename: string): string | undefined {
  return DATASET_CONTENT_TYPES[extname(filename).toLowerCase()];
}

/**
 * Uploads a dataset file and returns where the engine stored it. `lexq analytics dataset upload`
 * and the local MCP tool lexq_dataset_upload_file both send through here.
 *
 * The bytes go as they are. Reading the file into a string first would replace every byte
 * sequence that is not valid UTF-8.
 *
 * Any other extension goes as application/octet-stream, which the engine refuses with its own
 * error.
 */
export function uploadDataset(
  bytes: Uint8Array,
  filename: string,
  options: ApiClientOptions,
): Promise<DatasetUploadResponse> {
  const form = new FormData();
  const type = datasetContentType(filename) ?? 'application/octet-stream';
  form.append('file', new Blob([bytes], { type }), filename);
  return apiRequest<DatasetUploadResponse>('POST', 'analytics/datasets/upload', {
    ...options,
    form,
  });
}
