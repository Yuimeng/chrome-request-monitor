/**
 * 模块：devtool / utils / formatters —— 展示格式化与配色
 *
 * 组成：
 *   - formatDuration  耗时格式化（<1ms / ms / 秒）
 *   - formatTime      时间戳 → HH:MM:SS.mmm
 *   - formatUrl       URL → 路径+查询串（列表显示）/ 完整 URL（悬浮提示）
 *   - statusTone / durationTone  状态码与耗时的语义分级（由 CSS 类着色，不在 JS 里写死颜色）
 *
 * 协作：被 RequestTable、GeneralTab、StatusBar 等展示组件复用；
 *   颜色统一交给 App.css 的 .status-* / .value-* 类，便于整体换肤。
 */
export function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
}

export function formatUrl(url: string): { pathname: string; full: string } {
  try {
    const parsed = new URL(url);
    return { pathname: parsed.pathname + parsed.search, full: url };
  } catch {
    return { pathname: url, full: url };
  }
}

export type Tone = 'ok' | 'warn' | 'error' | 'none';

/** 状态码分级：2xx 正常 / 3xx 提示 / 4xx-5xx 异常 / 0 无响应 */
export function statusTone(status: number): Tone {
  if (!status) return 'none';
  if (status < 300) return 'ok';
  if (status < 400) return 'warn';
  return 'error';
}

/** 耗时分级的阈值与状态码不同（200ms / 500ms），单独判定 */
export function durationTone(ms: number): Tone {
  if (ms < 200) return 'ok';
  if (ms < 500) return 'warn';
  return 'error';
}
