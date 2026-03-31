export const API_BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText: string, message?: string) {
    super(message ?? `API error: ${status} ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
  }
}

function snakeToCamelStr(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function camelToSnakeStr(s: string): string {
  return s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

export function snakeToCamel<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (Array.isArray(obj)) return obj.map((item) => snakeToCamel(item)) as T;
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[snakeToCamelStr(key)] = snakeToCamel(value);
    }
    return result as T;
  }
  return obj as T;
}

export function camelToSnake(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((item) => camelToSnake(item));
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[camelToSnakeStr(key)] = camelToSnake(value);
    }
    return result;
  }
  return obj;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }

  const json: unknown = await response.json();
  return snakeToCamel<T>(json);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(camelToSnake(body)) : undefined,
  });
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(camelToSnake(body)) : undefined,
  });
}
