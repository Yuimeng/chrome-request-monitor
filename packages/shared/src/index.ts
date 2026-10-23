/**
 * 模块：shared / index —— 包入口（barrel export）
 *
 * 组成：仅 re-export types.ts 的类型与 constants.ts 的常量，无运行时逻辑。
 * 协作：其他包统一以 `@request-monitor/shared` 名义导入，不深入其内部文件。
 */
export type { RequestRecord, FilterConfig, AppConfig, CaptureFilter, Message, DecryptPayload } from './types';
export { STORAGE_KEYS, MESSAGE_TYPES, EVENTS, MAX_BODY_SIZE, PORT_NAME_DEVTOOLS } from './constants';
