/**
 * 模块：content / isolated-world —— 隔离世界内容脚本（桥梁层）
 *
 * 组成：
 *   - DEFAULT_FILTER / loadConfig / dispatchConfig  从 chrome.storage.sync 读取开关、抓取过滤与 body 上限，
 *     并通过 CustomEvent(EVENTS.MONITOR_CONFIG) 下发给 main-world
 *   - injectMainScript     以 <script src=chrome.runtime.getURL()> 注入 main-world 脚本到页面
 *   - pendingBuffer / flushBuffer  上报缓冲：把页面事件攒批后 sendMessage 给 background，
 *     失败自动重试（处理 Service Worker 休眠/重启），200ms 间隔连续冲刷
 *   - handleStorageChange  监听配置变化，实时把新的开关/过滤规则/上限转发给 main-world
 *
 * 协作：
 *   - 页面 fetch/XHR 被 hook 后发出 REQUEST_CAPTURED CustomEvent → 本层接收 → 批量转发给 background
 *   - popup 修改 chrome.storage.sync 配置 → 本层 onChanged → 注入的 main-world 即时生效
 *   - 之所以分两层：内容脚本运行在隔离世界，无法 hook 页面的 window.fetch，
 *     必须由 main-world 在页面主世界里替换原型方法（见 main-world.ts）
 */
import { EVENTS, MESSAGE_TYPES, STORAGE_KEYS, normalizeLimit } from '@request-monitor/shared';
import type { CaptureFilter, RequestRecord } from '@request-monitor/shared';

const DEFAULT_FILTER: CaptureFilter = {
  urlPattern: '',
  captureFetch: true,
  captureXHR: true,
  methods: [],
};

// 下发给 main-world 的完整配置：开关 + 抓取过滤 + 单条 body 上限
interface MonitorConfig {
  enabled: boolean;
  filter: CaptureFilter;
  maxBodySize: number;
}

let savedConfig: MonitorConfig | null = null;
let mainScriptLoaded = false;

// 页面侧上报缓冲：SW 可能已休眠导致 sendMessage 失败，攒批 + 重试保证不丢数据
const pendingBuffer: RequestRecord[] = [];
let flushing = false;

// 冲刷缓冲：一次性批量发送，成功才移除；仍有积压则 200ms 后继续（避免高频小包）
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

// 把当前配置广播给 main-world（需等 main 脚本加载完成，否则事件无人监听）
function dispatchConfig() {
  if (!savedConfig || !mainScriptLoaded) return;
  window.dispatchEvent(new CustomEvent(EVENTS.MONITOR_CONFIG, {
    detail: savedConfig,
  }));
}

// 从 chrome.storage.sync 读取启用开关、抓取过滤与 body 上限，归一化后下发
function loadConfig() {
  chrome.storage.sync.get(
    [STORAGE_KEYS.ENABLED, STORAGE_KEYS.CAPTURE_FILTER, STORAGE_KEYS.MAX_BODY_SIZE],
    (result) => {
      const enabled = result[STORAGE_KEYS.ENABLED] ?? false;
      const filter: CaptureFilter = { ...DEFAULT_FILTER, ...(result[STORAGE_KEYS.CAPTURE_FILTER] ?? {}) };
      // 历史数据可能缺失或非法，统一收敛到合法区间（默认 1MB）
      const maxBodySize = normalizeLimit('maxBodySize', result[STORAGE_KEYS.MAX_BODY_SIZE]);
      savedConfig = { enabled, filter, maxBodySize };
      dispatchConfig();
    },
  );
}

// 注入 main-world 脚本：内容脚本默认隔离世界，需通过 <script> 标签进入页面主世界才能 patch fetch/XHR
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

// 启动序列：先读配置，同时注入 main 脚本（两者完成时机会各自 dispatchConfig）
loadConfig();
injectMainScript();

// 监听 main-world 发出的捕获事件，转入缓冲并尝试冲刷
window.addEventListener(EVENTS.REQUEST_CAPTURED, ((event: CustomEvent) => {
  pendingBuffer.push(event.detail);
  flushBuffer();
}) as EventListener);

// Fallback: retry buffered messages periodically (handles SW restart)
setInterval(() => {
  if (pendingBuffer.length > 0) flushBuffer();
}, 1000);

// 配置变更（popup 修改开关/过滤/上限）→ 重新加载并转发给 main-world 实时生效
function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }) {
  if (
    STORAGE_KEYS.ENABLED in changes ||
    STORAGE_KEYS.CAPTURE_FILTER in changes ||
    STORAGE_KEYS.MAX_BODY_SIZE in changes
  ) {
    loadConfig();
  }
}

chrome.storage.onChanged.addListener(handleStorageChange);
