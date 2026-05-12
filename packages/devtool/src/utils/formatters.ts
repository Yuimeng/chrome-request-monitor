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
