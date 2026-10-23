/**
 * 模块：devtool / utils / har —— HAR 文件解析
 *
 * 组成：
 *   - HarEntry / HarLog   HAR 1.2 规范的最小类型子集（只取本扩展需要的字段）
 *   - parseHar(json)      校验 JSON 结构 → 把每个 entry 映射为 RequestRecord（type='har'）
 *   - isHarContent(json)  快速判断文本是否为含 log.entries 的 HAR
 *
 * 协作：Toolbar 的文件选择导入与 App 的拖拽导入都经 parseHar → importRequests 进入列表与 background。
 */
import type { RequestRecord } from '@request-monitor/shared';

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    headers: { name: string; value: string }[];
    postData?: { text: string };
  };
  response: {
    status: number;
    headers: { name: string; value: string }[];
    content?: { text?: string; mimeType?: string };
  };
}

interface HarLog {
  log: {
    entries: HarEntry[];
  };
}

export function parseHar(json: string): RequestRecord[] {
  let har: HarLog;
  try {
    har = JSON.parse(json) as HarLog;
  } catch {
    throw new Error('Invalid JSON file');
  }

  const entries = har.log?.entries;
  if (!Array.isArray(entries)) {
    throw new Error('HAR file must contain log.entries array');
  }

  return entries.map((entry, index) => {
    const reqHeaders: [string, string][] = (entry.request.headers || []).map(
      (h) => [h.name, h.value]
    );
    const resHeaders: [string, string][] = (entry.response.headers || []).map(
      (h) => [h.name, h.value]
    );

    const startTime = new Date(entry.startedDateTime).getTime();

    return {
      id: `${Date.now()}-${index}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
      method: entry.request.method,
      url: entry.request.url,
      requestHeaders: reqHeaders,
      requestBody: entry.request.postData?.text,
      responseStatus: entry.response.status,
      responseHeaders: resHeaders,
      responseBody: entry.response.content?.text,
      startTime: isNaN(startTime) ? Date.now() : startTime,
      duration: entry.time >= 0 ? entry.time : 0,
      type: 'har',
    };
  });
}

export function isHarContent(json: string): boolean {
  try {
    const obj = JSON.parse(json);
    return !!(obj.log?.entries);
  } catch {
    return false;
  }
}
