/**
 * 模块：background —— Service Worker（消息中枢 + 数据缓冲）
 *
 * 组成：
 *   - requestBuffer         内存中的请求记录缓冲（最多保留 500 条，session 存储持久化）
 *   - devtoolsPorts         已连接的 DevTools 面板 Port 集合（用于实时推送）
 *   - broadcastToDevTools   向所有面板广播单条新记录，断开的 Port 自动清理
 *   - persistBuffer / restoreBuffer  缓冲写入/恢复 chrome.storage.session（SW 休眠后可恢复）
 *   - handleDecrypt         代理 fetch 到外部解密服务（带超时控制），返回解密结果
 *   - onMessage             消息路由：接收抓取记录、批量写入、查询列表/计数、解密、导入、清空
 *   - onConnect             接受 DevTools 面板的长连接，连接时回放缓冲数据
 *
 * 协作：
 *   - 上游：content（isolated-world）通过 runtime.sendMessage 送来 REQUEST_CAPTURED / REQUESTS_BATCH
 *   - 下游：DevTools 面板通过 Port 实时接收 REQUEST_CAPTURED，并可按需拉取全量/计数
 *   - popup 通过 runtime.sendMessage 查询计数、清空、配置（存储直接走 chrome.storage）
 */
import { MESSAGE_TYPES, PORT_NAME_DEVTOOLS, STORAGE_KEYS } from '@request-monitor/shared';
import type { RequestRecord, DecryptPayload } from '@request-monitor/shared';

// 内存缓冲：所有被抓取的请求记录，读操作直接从这里响应（上限 500 条由 persistBuffer 截断）
const requestBuffer: RequestRecord[] = [];
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

// 将缓冲持久化到 chrome.storage.session（浏览器关闭前 SW 被杀也能恢复）；只保留最近 500 条
async function persistBuffer() {
  try {
    await chrome.storage.session.set({ [STORAGE_KEYS.REQUEST_BUFFER]: requestBuffer.slice(-500) });
  } catch {
    // storage.session may not be available in all contexts
  }
}

async function restoreBuffer() {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEYS.REQUEST_BUFFER);
    if (result[STORAGE_KEYS.REQUEST_BUFFER]) {
      requestBuffer.push(...result[STORAGE_KEYS.REQUEST_BUFFER]);
    }
  } catch {
    // storage.session may not be available
  }
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
      const record = message.data as RequestRecord;
      requestBuffer.push(record);
      broadcastToDevTools(record);
      persistBuffer();
      break;
    }
    case MESSAGE_TYPES.REQUESTS_BATCH: {
      const records = message.data as RequestRecord[];
      for (const record of records) {
        requestBuffer.push(record);
        broadcastToDevTools(record);
      }
      persistBuffer();
      sendResponse({ ok: true });
      return true;
    }
    case MESSAGE_TYPES.GET_CAPTURED_REQUESTS: {
      sendResponse({ type: MESSAGE_TYPES.CAPTURED_REQUESTS_RESPONSE, data: requestBuffer });
      return true;
    }
    case MESSAGE_TYPES.GET_REQUEST_COUNT: {
      sendResponse({ type: MESSAGE_TYPES.REQUEST_COUNT_RESPONSE, count: requestBuffer.length });
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
      const records = message.data as RequestRecord[];
      requestBuffer.push(...records);
      persistBuffer();
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
  port.postMessage({ type: MESSAGE_TYPES.CAPTURED_REQUESTS_RESPONSE, data: requestBuffer });

  port.onDisconnect.addListener(() => {
    devtoolsPorts.delete(port);
  });
});

// SW 启动时恢复上一次会话的缓冲数据
restoreBuffer();
