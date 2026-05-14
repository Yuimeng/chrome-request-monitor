import { MESSAGE_TYPES, PORT_NAME_DEVTOOLS, STORAGE_KEYS } from '@request-monitor/shared';
import type { RequestRecord, DecryptPayload } from '@request-monitor/shared';

const requestBuffer: RequestRecord[] = [];
const devtoolsPorts: Set<chrome.runtime.Port> = new Set();

function broadcastToDevTools(record: RequestRecord) {
  for (const port of devtoolsPorts) {
    try {
      port.postMessage({ type: MESSAGE_TYPES.REQUEST_CAPTURED, data: record });
    } catch {
      devtoolsPorts.delete(port);
    }
  }
}

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
    case MESSAGE_TYPES.GET_CAPTURED_REQUESTS: {
      sendResponse({ type: MESSAGE_TYPES.CAPTURED_REQUESTS_RESPONSE, data: requestBuffer });
      break;
    }
    case MESSAGE_TYPES.GET_REQUEST_COUNT: {
      sendResponse({ type: MESSAGE_TYPES.REQUEST_COUNT_RESPONSE, count: requestBuffer.length });
      break;
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
      break;
    }
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME_DEVTOOLS) return;

  devtoolsPorts.add(port);
  port.postMessage({ type: MESSAGE_TYPES.CAPTURED_REQUESTS_RESPONSE, data: requestBuffer });

  port.onDisconnect.addListener(() => {
    devtoolsPorts.delete(port);
  });
});

restoreBuffer();
