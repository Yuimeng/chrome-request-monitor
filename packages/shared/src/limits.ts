/**
 * 模块：shared / limits —— 容量限制配置（默认值 / 合法边界 / 归一化）
 *
 * 组成：
 *   - DEFAULT_LIMITS   未配置时的兜底值（body 1,000,000 字符 ≈ 1MB；缓冲 500 条）
 *   - LIMIT_BOUNDS     每个上限的合法区间与步长，popup 表单与 background 共用
 *   - normalizeLimit   把 storage 中的任意值（字符串/NaN/越界）收敛为合法数字
 *   - normalizeLimits  批量归一化
 *
 * 协作：
 *   - popup 用 LIMIT_BOUNDS 渲染输入框并做提交前校验；
 *   - content / background 读取 storage 后用 normalizeLimit 兜底，
 *     避免历史脏数据或手改 storage 导致缓冲失控。
 */
import type { LimitConfig } from './types';

export const DEFAULT_LIMITS: LimitConfig = {
  maxBodySize: 1_000_000, // 1MB（按字符数计算，请求体/响应体各自独立）
  maxRequests: 500,
};

export const LIMIT_BOUNDS = {
  maxBodySize: { min: 1_000, max: 20_000_000, step: 1_000 },
  maxRequests: { min: 10, max: 20_000, step: 10 },
} as const;

export type LimitKey = keyof LimitConfig;

// 把任意输入收敛到 [min, max] 的整数；非数字/无穷大回退默认值
export function normalizeLimit(key: LimitKey, value: unknown): number {
  const { min, max } = LIMIT_BOUNDS[key];
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function normalizeLimits(partial: Partial<Record<LimitKey, unknown>>): LimitConfig {
  return {
    maxBodySize: normalizeLimit('maxBodySize', partial.maxBodySize),
    maxRequests: normalizeLimit('maxRequests', partial.maxRequests),
  };
}
