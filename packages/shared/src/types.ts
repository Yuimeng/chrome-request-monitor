/**
 * 模块：shared / types —— 全局共享类型定义（数据契约）
 *
 * 组成：
 *   - RequestRecord   单条请求记录（id/method/url/请求与响应头与体/耗时/type 来源）
 *   - FilterConfig    DevTools 面板的展示过滤条件（url/method/status/type）
 *   - AppConfig       全局开关配置（enabled）
 *   - CaptureFilter   抓取过滤配置（在 content 侧生效，决定哪些请求被捕获）
 *   - Message         background 消息协议的可辨识联合类型（请求/响应/指令）
 *   - DecryptPayload  转发给外部解密服务的载荷（url/body/headers/timeoutMs）
 *
 * 协作：
 *   - 被 content、background、devtool、popup 四个包共同 import，
 *     是消息传递（chrome.runtime / Port）与存储数据的统一结构约定。
 */
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
  | { type: 'IMPORT_REQUESTS'; data: RequestRecord[] }
  | { type: 'REQUESTS_BATCH'; data: RequestRecord[] };

export interface DecryptPayload {
  url: string;
  body: unknown;
  headers: Record<string, string>;
  timeoutMs: number;
}
