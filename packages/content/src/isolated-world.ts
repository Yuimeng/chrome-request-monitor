import { EVENTS, MESSAGE_TYPES, STORAGE_KEYS } from '@request-monitor/shared';
import type { CaptureFilter, RequestRecord } from '@request-monitor/shared';

const DEFAULT_FILTER: CaptureFilter = {
  urlPattern: '',
  captureFetch: true,
  captureXHR: true,
  methods: [],
};

let savedConfig: { enabled: boolean; filter: CaptureFilter } | null = null;
let mainScriptLoaded = false;

// Buffer for reliable message delivery when SW is terminated
const pendingBuffer: RequestRecord[] = [];
let flushing = false;

function flushBuffer() {
  if (flushing || pendingBuffer.length === 0) return;
  flushing = true;
  const batch = pendingBuffer.slice();

  chrome.runtime.sendMessage(
    { type: MESSAGE_TYPES.REQUESTS_BATCH, data: batch },
    (response) => {
      if (chrome.runtime.lastError) {
        flushing = false;
        return;
      }
      if (response?.ok) {
        pendingBuffer.splice(0, batch.length);
      }
      flushing = false;
      if (pendingBuffer.length > 0) {
        setTimeout(flushBuffer, 200);
      }
    },
  );
}

function dispatchConfig() {
  if (!savedConfig || !mainScriptLoaded) return;
  window.dispatchEvent(new CustomEvent(EVENTS.MONITOR_CONFIG, {
    detail: savedConfig,
  }));
}

function loadConfig() {
  chrome.storage.sync.get([STORAGE_KEYS.ENABLED, STORAGE_KEYS.CAPTURE_FILTER], (result) => {
    const enabled = result[STORAGE_KEYS.ENABLED] ?? false;
    const filter: CaptureFilter = { ...DEFAULT_FILTER, ...(result[STORAGE_KEYS.CAPTURE_FILTER] ?? {}) };
    savedConfig = { enabled, filter };
    dispatchConfig();
  });
}

function injectMainScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/main.js');
  script.onload = () => {
    script.remove();
    mainScriptLoaded = true;
    dispatchConfig();
  };
  (document.documentElement || document.head || document).appendChild(script);
}

loadConfig();
injectMainScript();

window.addEventListener(EVENTS.REQUEST_CAPTURED, ((event: CustomEvent) => {
  pendingBuffer.push(event.detail);
  flushBuffer();
}) as EventListener);

// Fallback: retry buffered messages periodically (handles SW restart)
setInterval(() => {
  if (pendingBuffer.length > 0) flushBuffer();
}, 1000);

function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }) {
  if (STORAGE_KEYS.ENABLED in changes || STORAGE_KEYS.CAPTURE_FILTER in changes) {
    loadConfig();
  }
}

chrome.storage.onChanged.addListener(handleStorageChange);
