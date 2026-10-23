/**
 * 模块：devtool / utils / formatters —— 展示格式化与配色
 *
 * 组成：
 *   - formatDuration  耗时格式化（<1ms / ms / 秒）
 *   - formatTime      时间戳 → HH:MM:SS.mmm
 *   - formatUrl       URL → 路径+查询串（列表显示）/ 完整 URL（悬浮提示）
 *   - getDurationColor / getStatusColor  耗时与状态码的红黄绿配色规则
 *
 * 协作：被 RequestTable、GeneralTab、StatusBar 等展示组件复用。
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

export function getDurationColor(ms: number): string {
  if (ms < 200) return '#4CAF50';
  if (ms < 500) return '#FF9800';
  return '#F44336';
}

export function getStatusColor(status: number): string {
  if (status === 0) return '#999';
  if (status < 300) return '#4CAF50';
  if (status < 400) return '#FF9800';
  return '#F44336';
}
