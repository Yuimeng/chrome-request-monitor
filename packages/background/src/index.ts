import { MESSAGE_TYPES, PORT_NAME_DEVTOOLS, STORAGE_KEYS } from '@request-monitor/shared';
import type { RequestRecord } from '@request-monitor/shared';

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
  }
  return true;
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
