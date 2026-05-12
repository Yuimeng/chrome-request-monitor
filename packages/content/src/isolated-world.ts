import { EVENTS, STORAGE_KEYS } from '@request-monitor/shared';
import type { CaptureFilter } from '@request-monitor/shared';

const DEFAULT_FILTER: CaptureFilter = {
  urlPattern: '',
  captureFetch: true,
  captureXHR: true,
  methods: [],
};

function sendConfig() {
  chrome.storage.sync.get([STORAGE_KEYS.ENABLED, STORAGE_KEYS.CAPTURE_FILTER], (result) => {
    const enabled = result[STORAGE_KEYS.ENABLED] ?? false;
    const filter: CaptureFilter = { ...DEFAULT_FILTER, ...(result[STORAGE_KEYS.CAPTURE_FILTER] ?? {}) };
    window.dispatchEvent(new CustomEvent(EVENTS.MONITOR_CONFIG, {
      detail: { enabled, filter },
    }));
  });
}

const script = document.createElement('script');
script.src = chrome.runtime.getURL('content/main.js');
script.onload = () => {
  script.remove();
  sendConfig();
};
document.documentElement.appendChild(script);

window.addEventListener(EVENTS.REQUEST_CAPTURED, ((event: CustomEvent) => {
  chrome.runtime.sendMessage({
    type: 'REQUEST_CAPTURED',
    data: event.detail,
  });
}) as EventListener);

function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }) {
  if (STORAGE_KEYS.ENABLED in changes || STORAGE_KEYS.CAPTURE_FILTER in changes) {
    sendConfig();
  }
}

chrome.storage.onChanged.addListener(handleStorageChange);
