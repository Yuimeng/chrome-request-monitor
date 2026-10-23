/**
 * 模块：shared / constants —— 全局共享常量
 *
 * 组成：
 *   - STORAGE_KEYS     chrome.storage 的键名（sync：开关/抓取过滤/解密配置；session：请求缓冲）
 *   - MESSAGE_TYPES    chrome.runtime 消息类型枚举，与 types.ts 中 Message 联合类型一一对应
 *   - EVENTS           页面内 CustomEvent 事件名，用于 main-world ↔ isolated-world 跨世界通信
 *   - MAX_BODY_SIZE    响应体截断上限（1MB），避免大响应撑爆存储
 *   - PORT_NAME_DEVTOOLS  DevTools 面板连接 background 的长连接端口名
 *
 * 协作：
 *   - content 用 EVENTS 收发页面事件；background/devtool/popup 用 MESSAGE_TYPES 通信；
 *     所有包通过 STORAGE_KEYS 读写同一份配置，保证跨界面状态一致。
 */
export const STORAGE_KEYS = {
  ENABLED: 'monitor_enabled',
  REQUEST_BUFFER: 'request_buffer',
  CAPTURE_FILTER: 'capture_filter',
  DECRYPT_URL: 'decrypt_url',
  AUTO_DECRYPT: 'auto_decrypt',
} as const;

export const MESSAGE_TYPES = {
  REQUEST_CAPTURED: 'REQUEST_CAPTURED',
  GET_CAPTURED_REQUESTS: 'GET_CAPTURED_REQUESTS',
  CAPTURED_REQUESTS_RESPONSE: 'CAPTURED_REQUESTS_RESPONSE',
  GET_REQUEST_COUNT: 'GET_REQUEST_COUNT',
  REQUEST_COUNT_RESPONSE: 'REQUEST_COUNT_RESPONSE',
  DECRYPT_REQUEST: 'DECRYPT_REQUEST',
  DECRYPT_RESPONSE: 'DECRYPT_RESPONSE',
  CLEAR_REQUESTS: 'CLEAR_REQUESTS',
  IMPORT_REQUESTS: 'IMPORT_REQUESTS',
  REQUESTS_BATCH: 'REQUESTS_BATCH',
} as const;

export const EVENTS = {
  REQUEST_CAPTURED: '__request_captured__',
  MONITOR_CONFIG: '__monitor_config__',
} as const;

export const MAX_BODY_SIZE = 1_000_000; // 1MB

export const PORT_NAME_DEVTOOLS = 'devtools';
