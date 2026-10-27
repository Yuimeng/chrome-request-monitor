/**
 * 模块：popup / App —— 弹窗根组件（监控开关与全局配置）
 *
 * 组成：
 *   - 头部品牌区             标题 + 副标题（说明用途）
 *   - 开关卡片               Enable Monitoring + 状态说明，开关右对齐（避免窄宽度下折行）
 *   - 次级操作行             Filters / Limits 面板切换，非默认配置时显示圆点提示
 *   - FilterConfig 面板      抓取过滤，草稿编辑 + Apply/Cancel
 *   - LimitsConfig 面板      容量上限（body 体积 / 保留条数）
 *   - StatusBadge            运行状态、已捕获计数与缓冲占用进度
 *   - Clear 按钮             广播 CLEAR_REQUESTS 清空 background 缓冲与所有面板
 *   - Decrypt 设置区         AUTO_DECRYPT 开关与 DECRYPT_URL 解密服务地址
 *     （地址用本地草稿 + 防抖写入，避免每次按键回写 storage 导致光标跳到末尾）
 *
 * 协作：
 *   - 配置写入 chrome.storage.sync → isolated-world onChanged → 下发 main-world 即时生效
 *   - MAX_REQUESTS 写入后由 background onChanged 感知，立即按时间淘汰超出部分
 *   - 指令类操作（计数/清空）走 runtime.sendMessage → background onMessage
 */
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_LIMITS, MESSAGE_TYPES, STORAGE_KEYS, normalizeLimit } from '@request-monitor/shared';
import type { CaptureFilter, LimitConfig } from '@request-monitor/shared';
import { useStorage } from './hooks/useStorage';
import ToggleSwitch from './components/ToggleSwitch';
import StatusBadge from './components/StatusBadge';
import FilterConfig from './components/FilterConfig';
import LimitsConfig from './components/LimitsConfig';

const DEFAULT_FILTER: CaptureFilter = {
  urlPattern: '',
  captureFetch: true,
  captureXHR: true,
  methods: [],
};

export default function App() {
  const [enabled, setEnabled, loading] = useStorage<boolean>(STORAGE_KEYS.ENABLED, false);
  const [filter, setFilter, filterLoading] = useStorage<CaptureFilter>(STORAGE_KEYS.CAPTURE_FILTER, DEFAULT_FILTER);
  const [count, setCount] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilter, setDraftFilter] = useState<CaptureFilter>(DEFAULT_FILTER);
  const [decryptUrl, setDecryptUrl] = useStorage(STORAGE_KEYS.DECRYPT_URL, '');
  const [autoDecrypt, setAutoDecrypt] = useStorage(STORAGE_KEYS.AUTO_DECRYPT, true);
  const [maxBodySize, setMaxBodySize] = useStorage<number>(STORAGE_KEYS.MAX_BODY_SIZE, DEFAULT_LIMITS.maxBodySize);
  const [maxRequests, setMaxRequests] = useStorage<number>(STORAGE_KEYS.MAX_REQUESTS, DEFAULT_LIMITS.maxRequests);
  const [showLimits, setShowLimits] = useState(false);

  // 解密地址输入框：用本地草稿驱动，不再每次按键直写 storage.sync。
  // 直接受控于 storage 会形成「按键 → 写入 → onChanged 回写」的回环，
  // 异步回写让受控值短暂回退，光标被重置到末尾；同时高频写入会触发 sync 配额限制。
  const [urlDraft, setUrlDraft] = useState('');
  const urlCommitTimer = useRef<number | null>(null);

  // 外部值变化（首次加载、其他窗口修改）同步到草稿；输入中不覆盖，避免打断输入
  useEffect(() => {
    if (document.activeElement?.id === 'decrypt-url') return;
    setUrlDraft(decryptUrl);
  }, [decryptUrl]);

  useEffect(() => () => {
    if (urlCommitTimer.current !== null) window.clearTimeout(urlCommitTimer.current);
  }, []);

  const commitDecryptUrl = (value: string) => {
    if (urlCommitTimer.current !== null) {
      window.clearTimeout(urlCommitTimer.current);
      urlCommitTimer.current = null;
    }
    setDecryptUrl(value);
  };

  // 存储中的值可能缺失/越界（历史数据、手改 storage），统一归一化后再使用
  const limits: LimitConfig = {
    maxBodySize: normalizeLimit('maxBodySize', maxBodySize),
    maxRequests: normalizeLimit('maxRequests', maxRequests),
  };

  const updateLimits = (partial: Partial<LimitConfig>) => {
    if (partial.maxBodySize !== undefined) setMaxBodySize(partial.maxBodySize);
    if (partial.maxRequests !== undefined) setMaxRequests(partial.maxRequests);
  };

  const hasCustomLimits =
    limits.maxBodySize !== DEFAULT_LIMITS.maxBodySize || limits.maxRequests !== DEFAULT_LIMITS.maxRequests;

  useEffect(() => {
    const updateCount = () => {
      chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_REQUEST_COUNT }, (response) => {
        if (response?.count !== undefined) setCount(response.count);
      });
    };

    updateCount();
    const interval = setInterval(updateCount, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (showFilters) setDraftFilter(filter);
  }, [showFilters]);

  const hasActiveFilters = filter.urlPattern || !filter.captureFetch || !filter.captureXHR || filter.methods.length > 0;

  if (loading || filterLoading) {
    return (
      <div className="popup">
        <p className="loading">Loading…</p>
      </div>
    );
  }

  return (
    <div className="popup">
      <header className="popup-header">
        <div className="brand">
          <span className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12h4l3 8 4-16 3 8h4" />
            </svg>
          </span>
          <div>
            <div className="brand-title">Request Monitor</div>
            <div className="brand-sub">fetch &amp; XHR capture</div>
          </div>
        </div>
      </header>

      <div className="popup-body">
        <section className="card switch-card">
          <div>
            <div className="card-title">Enable Monitoring</div>
            <div className="card-hint">
              {enabled ? 'Capturing requests on all tabs' : 'Monitoring is paused'}
            </div>
          </div>
          <ToggleSwitch enabled={enabled} onChange={setEnabled} label="Enable monitoring" />
        </section>

        <div className="actions">
          <button
            type="button"
            className={showFilters ? 'ghost-btn is-active' : 'ghost-btn'}
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
          >
            Filters
            {hasActiveFilters && <span className="dot" title="Custom filter is active" />}
          </button>
          <button
            type="button"
            className={showLimits ? 'ghost-btn is-active' : 'ghost-btn'}
            onClick={() => setShowLimits(!showLimits)}
            aria-expanded={showLimits}
          >
            Limits
            {hasCustomLimits && <span className="dot" title="Custom limits are active" />}
          </button>
        </div>

        {showFilters && (
          <>
            <FilterConfig filter={draftFilter} onChange={setDraftFilter} />
            <div className="btn-row">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setDraftFilter(filter); setShowFilters(false); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-accent"
                onClick={() => { setFilter(draftFilter); setShowFilters(false); }}
              >
                Apply
              </button>
            </div>
          </>
        )}

        {showLimits && <LimitsConfig limits={limits} onChange={updateLimits} />}

        <StatusBadge enabled={enabled} count={count} max={limits.maxRequests} />

        <button
          type="button"
          className="danger-btn"
          onClick={() => {
            chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CLEAR_REQUESTS });
            setCount(0);
          }}
          disabled={count === 0}
        >
          Clear captured requests
        </button>

        <div className="section">
          <div className="section-title">Decrypt service</div>
          <div className="switch-row">
            <span>Auto decrypt on open</span>
            <ToggleSwitch enabled={autoDecrypt} onChange={setAutoDecrypt} size="sm" label="Auto decrypt" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="decrypt-url">API URL</label>
            <input
              id="decrypt-url"
              className="text-input"
              type="text"
              placeholder="http://localhost:3000/decrypt"
              value={urlDraft}
              onChange={(e) => {
                const value = e.target.value;
                setUrlDraft(value);
                // 防抖落盘：停止输入 400ms 后才写 storage，兼顾不丢内容与写入频率
                if (urlCommitTimer.current !== null) window.clearTimeout(urlCommitTimer.current);
                urlCommitTimer.current = window.setTimeout(() => {
                  urlCommitTimer.current = null;
                  setDecryptUrl(value);
                }, 400);
              }}
              onBlur={() => commitDecryptUrl(urlDraft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
