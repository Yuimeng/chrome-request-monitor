/**
 * 模块：shared / types —— 全局共享类型定义（数据契约）
 *
 * 组成：
 *   - RequestRecord   单条请求记录（id/method/url/请求与响应头与体/耗时/type 来源）
 *   - FilterConfig    DevTools 面板的展示过滤条件（url/method/status/type）
 *   - AppConfig       全局开关配置（enabled）
 *   - CaptureFilter   抓取过滤配置（在 content 侧生效，决定哪些请求被捕获）
 *   - LimitConfig     容量限制配置（body 上限在 content 生效，条数上限在 background 生效）
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
  /**
   * Cookie 请求头值。来源见 cookieSource：
   * 实时抓包时页面 JS 读不到浏览器注入的 Cookie，由扩展进程侧补充（快照或 webRequest 权威值）
   */
  requestCookie?: string;
  /** requestCookie 的来源：header=抓包头（HAR 导入）、snapshot=cookies API 快照、webrequest=真实发送头 */
  cookieSource?: 'header' | 'snapshot' | 'webrequest';
  /** webRequest 已观察到该请求；为 true 且无 requestCookie 时表示“权威的没带 Cookie” */
  cookieObserved?: boolean;
  /** 页面侧判定本次请求是否会携带 Cookie（fetch credentials / XHR withCredentials 归一化），false 时跳过快照补全 */
  cookiesSent?: boolean;
  /** 实际发起请求的时刻（epoch ms），用于与 webRequest 事件对齐及修正 Start Time 显示 */
  sentAt?: number;
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

/**
 * 容量限制配置（popup 编辑，chrome.storage.sync 持久化）
 * 两个上限各自独立生效：body 上限控制单条记录体积，条数上限控制缓冲总量。
 */
export interface LimitConfig {
  /** 单条记录 body（请求体、响应体各自计算）允许的最大字符数，超出部分截断 */
  maxBodySize: number;
  /** background 缓冲最多保留的记录条数，超出后按时间淘汰最早的记录 */
  maxRequests: number;
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
  | { type: 'REQUESTS_BATCH'; data: RequestRecord[] }
  // background 因超出条数上限淘汰了记录，面板需按 id 同步移除
  | { type: 'REQUESTS_EVICTED'; ids: string[] };

export interface DecryptPayload {
  url: string;
  body: unknown;
  headers: Record<string, string>;
  timeoutMs: number;
}
