/**
 * 模块：background —— Service Worker（消息中枢 + 数据缓冲）
 *
 * 组成：
 *   - requestBuffer         内存中的请求记录缓冲（条数上限由 maxRequests 配置，默认 500 条）
 *   - maxRequests / enforceCapacity  按时间淘汰：超出上限时移除 sentAt 最早的记录
 *   - devtoolsPorts         已连接的 DevTools 面板 Port 集合（用于实时推送）
 *   - broadcastToDevTools   向所有面板广播单条新记录，断开的 Port 自动清理
 *   - broadcastEvicted      向所有面板广播被淘汰记录的 id，保持面板与缓冲一致
 *   - mergeRecords / ingestRecords  记录入列（先补 Cookie 快照再入列，串行保证顺序）
 *   - persistBuffer / restoreBuffer  缓冲写入/恢复 chrome.storage.session（SW 休眠后可恢复）
 *   - handleDecrypt         代理 fetch 到外部解密服务（带超时控制），返回解密结果
 *   - onMessage             消息路由：接收抓取记录、批量写入、查询列表/计数、解密、导入、清空
 *   - onConnect             接受 DevTools 面板的长连接，连接时回放缓冲数据
 *
 * 协作：
 *   - 上游：content（isolated-world）通过 runtime.sendMessage 送来 REQUEST_CAPTURED / REQUESTS_BATCH
 *   - 下游：DevTools 面板通过 Port 实时接收 REQUEST_CAPTURED，并可按需拉取全量/计数
 *   - popup 通过 runtime.sendMessage 查询计数、清空、配置（存储直接走 chrome.storage）
 *   - Cookie 快照：页面侧读不到浏览器注入的 Cookie，记录入列前由本 SW 用 chrome.cookies 补全，
 *     产出 requestCookie / cookieSource（见 cookie-snapshot.ts 与 docs/cookie-capture.md）
 */
import {
  DEFAULT_LIMITS,
  MESSAGE_TYPES,
  PORT_NAME_DEVTOOLS,
  STORAGE_KEYS,
  normalizeLimit,
} from '@request-monitor/shared';
import type { RequestRecord, DecryptPayload } from '@request-monitor/shared';
import { enrichRecordsWithCookieSnapshot } from './cookie-snapshot';

// 内存缓冲：所有被抓取的请求记录，读操作直接从这里响应（条数上限由 maxRequests 控制）
const requestBuffer: RequestRecord[] = [];
// 当前生效的条数上限（popup 可配，storage.sync 持久化）；变更时立即收缩缓冲
let maxRequests = DEFAULT_LIMITS.maxRequests;
// 当前连接的 DevTools 面板端口；面板可能开多个，需广播
const devtoolsPorts: Set<chrome.runtime.Port> = new Set();

// 将单条记录推送给所有已连接的面板；postMessage 失败说明端口已死，从集合中移除
function broadcastToDevTools(record: RequestRecord) {
  for (const port of devtoolsPorts) {
    try {
      port.postMessage({ type: MESSAGE_TYPES.REQUEST_CAPTURED, data: record });
    } catch {
      devtoolsPorts.delete(port);
    }
  }
}

// 淘汰通知：记录被移出缓冲后同步给面板，避免面板保留已淘汰记录导致计数不一致
function broadcastEvicted(ids: string[]) {
  if (ids.length === 0) return;
  for (const port of devtoolsPorts) {
    try {
      port.postMessage({ type: MESSAGE_TYPES.REQUESTS_EVICTED, ids });
    } catch {
      devtoolsPorts.delete(port);
    }
  }
}

// 淘汰排序的时间基准：抓包记录用墙钟 sentAt，HAR 导入用 epoch startTime；
// startTime 在实时抓包时是 performance.now() 相对值（远小于 epoch 量级），无法跨页比较，故返回 0 视为最旧
function recordTime(record: RequestRecord): number {
  if (typeof record.sentAt === 'number') return record.sentAt;
  return record.startTime > 1e12 ? record.startTime : 0;
}

// 按时间淘汰：超出上限时移除时间最早的 overflow 条，其余记录保持原有到达顺序。
// 返回被淘汰记录的 id，供面板同步移除。
function enforceCapacity(): string[] {
  const overflow = requestBuffer.length - maxRequests;
  if (overflow <= 0) return [];

  const oldest = requestBuffer
    .map((record, index) => ({ index, time: recordTime(record) }))
    .sort((a, b) => a.time - b.time)   // sort 稳定：同一时刻按到达顺序淘汰
    .slice(0, overflow);

  const dropIndexes = new Set(oldest.map((item) => item.index));
  const kept: RequestRecord[] = [];
  const evictedIds: string[] = [];

  requestBuffer.forEach((record, index) => {
    if (dropIndexes.has(index)) evictedIds.push(record.id);
    else kept.push(record);
  });

  requestBuffer.length = 0;
  for (const record of kept) requestBuffer.push(record);
  return evictedIds;
}

// 将缓冲持久化到 chrome.storage.session（浏览器关闭前 SW 被杀也能恢复）；
// 只写入上限内的最近记录；配额不足（默认 10MB）时折半重试，保证最近数据仍可恢复
async function persistBuffer() {
  try {
    await chrome.storage.session.set({
      [STORAGE_KEYS.REQUEST_BUFFER]: requestBuffer.slice(-maxRequests),
    });
  } catch {
    try {
      const fallbackCount = Math.max(1, Math.floor(maxRequests / 2));
      await chrome.storage.session.set({
        [STORAGE_KEYS.REQUEST_BUFFER]: requestBuffer.slice(-fallbackCount),
      });
    } catch {
      // storage.session may not be available in all contexts
    }
  }
}

async function restoreBuffer() {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEYS.REQUEST_BUFFER);
    if (result[STORAGE_KEYS.REQUEST_BUFFER]) {
      requestBuffer.push(...result[STORAGE_KEYS.REQUEST_BUFFER]);
      // 恢复的数据可能来自更宽松的上限配置，按当前上限裁剪
      enforceCapacity();
    }
  } catch {
    // storage.session may not be available
  }
}

// 读取条数上限配置（默认 500），非法值/缺失由 normalizeLimit 兜底
async function loadMaxRequests() {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.MAX_REQUESTS);
    maxRequests = normalizeLimit('maxRequests', result[STORAGE_KEYS.MAX_REQUESTS]);
  } catch {
    maxRequests = DEFAULT_LIMITS.maxRequests;
  }
}

// 上限变化后立即收缩缓冲，并把被淘汰的记录通知面板
function applyCapacity() {
  broadcastEvicted(enforceCapacity());
  persistBuffer();
}

// 记录入列队列：Cookie 快照补全是异步的，串行处理才能保证面板看到的顺序与到达顺序一致
let ingestQueue: Promise<void> = Promise.resolve();

// 把一批记录并入内存缓冲、广播给面板并持久化；入列后立即按上限淘汰最旧记录
function mergeRecords(records: RequestRecord[]) {
  for (const record of records) {
    requestBuffer.push(record);
    broadcastToDevTools(record);
  }
  broadcastEvicted(enforceCapacity());
  persistBuffer();
}

// 先补 Cookie 快照再入列；补全失败/超时只影响 Cookie 字段，绝不丢记录。
// 入列前等待 ready：确保条数上限已读取、历史缓冲已恢复，避免用默认上限误淘汰
function ingestRecords(records: RequestRecord[]): Promise<void> {
  ingestQueue = ingestQueue
    .catch(() => undefined)   // 上一批异常不能中断队列
    .then(async () => {
      await ready;
      try {
        await enrichRecordsWithCookieSnapshot(records);
      } catch {
        // 快照补全异常：退化为未补全记录
      }
      mergeRecords(records);
    });
  return ingestQueue;
}

// 代理调用外部解密服务：POST payload.body 到 payload.url，超时用 AbortController 中断
async function handleDecrypt(payload: DecryptPayload): Promise<{ success: boolean; data?: string; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), payload.timeoutMs);

  try {
    const res = await fetch(payload.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...payload.headers },
      body: JSON.stringify(payload.body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return { success: true, data: text };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Decrypt failed' };
  } finally {
    clearTimeout(timeout);
  }
}

// 核心消息路由：content/popup/devtool 的所有一次性请求都经此分发
// 注意：返回 true 表示 sendResponse 异步有效（SW 不会被提前回收）
chrome.runtime.onMessage.addListener((
  message: any,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => {
  switch (message.type) {
    case MESSAGE_TYPES.REQUEST_CAPTURED: {
      // 单条记录：异步补 Cookie 后入列；该分支没有 sendResponse，保持 break 即可
      const record = message.data as RequestRecord;
      void ingestRecords([record]);
      break;
    }
    case MESSAGE_TYPES.REQUESTS_BATCH: {
      // 批量记录：补全 Cookie 后入列，完成再回 ok（content 的 flushBuffer 依赖 ok 清缓冲）
      ingestRecords(message.data as RequestRecord[]).then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: true }),
      );
      return true;
    }
    case MESSAGE_TYPES.GET_CAPTURED_REQUESTS: {
      // 等启动完成再返回，避免 SW 刚唤醒时把尚未恢复的空缓冲当成最终结果
      ready.then(() => sendResponse({ type: MESSAGE_TYPES.CAPTURED_REQUESTS_RESPONSE, data: requestBuffer }));
      return true;
    }
    case MESSAGE_TYPES.GET_REQUEST_COUNT: {
      ready.then(() => sendResponse({ type: MESSAGE_TYPES.REQUEST_COUNT_RESPONSE, count: requestBuffer.length }));
      return true;
    }
    case MESSAGE_TYPES.DECRYPT_REQUEST: {
      handleDecrypt(message.payload as DecryptPayload)
        .then((result) => {
          sendResponse({ type: MESSAGE_TYPES.DECRYPT_RESPONSE, ...result });
        })
        .catch((err) => {
          sendResponse({ type: MESSAGE_TYPES.DECRYPT_RESPONSE, success: false, error: err instanceof Error ? err.message : 'Decrypt failed' });
        });
      return true;
    }
    case MESSAGE_TYPES.IMPORT_REQUESTS: {
      // HAR 导入：面板已在本地追加，这里只补入缓冲；仍按上限淘汰（导入的历史记录时间更早，通常先被裁掉）
      const records = message.data as RequestRecord[];
      void ready.then(() => {
        for (const record of records) requestBuffer.push(record);
        broadcastEvicted(enforceCapacity());
        persistBuffer();
      });
      break;
    }
    case MESSAGE_TYPES.CLEAR_REQUESTS: {
      requestBuffer.length = 0;
      persistBuffer();
      for (const port of devtoolsPorts) {
        try {
          port.postMessage({ type: MESSAGE_TYPES.CLEAR_REQUESTS });
        } catch {
          devtoolsPorts.delete(port);
        }
      }
      sendResponse({ ok: true });
      return true;
    }
  }
});

// DevTools 面板长连接入口：连接时先回放全量缓冲，之后靠 broadcastToDevTools 增量推送
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME_DEVTOOLS) return;

  devtoolsPorts.add(port);
  // 等启动完成再回放，保证恢复出来的历史记录不会漏给刚连上的面板
  void ready.then(() => {
    if (!devtoolsPorts.has(port)) return;   // 等待期间面板已断开
    try {
      port.postMessage({ type: MESSAGE_TYPES.CAPTURED_REQUESTS_RESPONSE, data: requestBuffer });
    } catch {
      devtoolsPorts.delete(port);
    }
  });

  port.onDisconnect.addListener(() => {
    devtoolsPorts.delete(port);
  });
});

// SW 启动：先恢复上限配置，再恢复上一次会话的缓冲（恢复后按当前上限裁剪）
async function bootstrap() {
  await loadMaxRequests();
  await restoreBuffer();
  persistBuffer();
}

// 启动完成的信号：入列/导入都等它，避免在配置与历史缓冲就绪前按默认上限淘汰
const ready = bootstrap();

// 上限配置变更：实时收缩缓冲，无需重载扩展
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !(STORAGE_KEYS.MAX_REQUESTS in changes)) return;
  maxRequests = normalizeLimit('maxRequests', changes[STORAGE_KEYS.MAX_REQUESTS].newValue);
  applyCapacity();
});
