/**
 * 模块：shared / index —— 包入口（barrel export）
 *
 * 组成：re-export types.ts 的类型、constants.ts 的常量、limits.ts 的容量限制配置与归一化。
 * 协作：其他包统一以 `@request-monitor/shared` 名义导入，不深入其内部文件。
 */
export type {
  RequestRecord,
  FilterConfig,
  AppConfig,
  CaptureFilter,
  LimitConfig,
  Message,
  DecryptPayload,
} from './types';
export { STORAGE_KEYS, MESSAGE_TYPES, EVENTS, PORT_NAME_DEVTOOLS } from './constants';
export { DEFAULT_LIMITS, LIMIT_BOUNDS, normalizeLimit, normalizeLimits } from './limits';
export type { LimitKey } from './limits';
