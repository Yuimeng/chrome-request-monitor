import { EVENTS, STORAGE_KEYS } from '@request-monitor/shared';
import type { CaptureFilter } from '@request-monitor/shared';

const DEFAULT_FILTER: CaptureFilter = {
  urlPattern: '',
  captureFetch: true,
  captureXHR: true,
  methods: [],
};

let savedConfig: { enabled: boolean; filter: CaptureFilter } | null = null;
let mainScriptLoaded = false;

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
  chrome.runtime.sendMessage({
    type: 'REQUEST_CAPTURED',
    data: event.detail,
  });
}) as EventListener);

function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }) {
  if (STORAGE_KEYS.ENABLED in changes || STORAGE_KEYS.CAPTURE_FILTER in changes) {
    loadConfig();
  }
}

chrome.storage.onChanged.addListener(handleStorageChange);
