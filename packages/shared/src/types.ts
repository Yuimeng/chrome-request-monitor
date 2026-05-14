export interface RequestRecord {
  id: string;
  method: string;
  url: string;
  requestHeaders: [string, string][];
  requestBody?: string;
  responseStatus: number;
  responseHeaders: [string, string][];
  responseBody?: string;
  startTime: number;
  duration: number;
  type: 'fetch' | 'xhr' | 'har';
}

export interface FilterConfig {
  urlFilter: string;
  methodFilter: string;
  statusFilter: string;
  typeFilter: string;
}

export interface AppConfig {
  enabled: boolean;
}

export interface CaptureFilter {
  urlPattern: string;
  captureFetch: boolean;
  captureXHR: boolean;
  methods: string[];
}

export type Message =
  | { type: 'REQUEST_CAPTURED'; data: RequestRecord }
  | { type: 'GET_CAPTURED_REQUESTS' }
  | { type: 'CAPTURED_REQUESTS_RESPONSE'; data: RequestRecord[] }
  | { type: 'GET_REQUEST_COUNT' }
  | { type: 'REQUEST_COUNT_RESPONSE'; count: number }
  | { type: 'DECRYPT_REQUEST'; payload: DecryptPayload }
  | { type: 'DECRYPT_RESPONSE'; success: boolean; data?: string; error?: string }
  | { type: 'CLEAR_REQUESTS' }
  | { type: 'IMPORT_REQUESTS'; data: RequestRecord[] };

export interface DecryptPayload {
  url: string;
  body: unknown;
  headers: Record<string, string>;
  timeoutMs: number;
}
