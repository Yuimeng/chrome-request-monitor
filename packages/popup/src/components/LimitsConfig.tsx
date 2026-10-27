/**
 * 模块：popup / components / LimitsConfig —— 容量限制配置表单
 *
 * 组成：
 *   - Max Body Size (KB)  单条记录请求体/响应体的上限，超出部分截断并标注
 *   - Max Requests        background 缓冲最多保留的条数，超出后按发送时间淘汰最早的记录
 *
 * 协作：受控组件，草稿保存在本地 state，仅在「失焦 / 回车」时提交并归一化。
 *   不做逐字符提交的原因：用户清空输入框时中间态为空串，若即时写入会被归一化成下限，
 *   进而触发 background 立即收缩缓冲、误删已有记录。
 */
import { useEffect, useState } from 'react';
import { LIMIT_BOUNDS, normalizeLimit } from '@request-monitor/shared';
import type { LimitConfig } from '@request-monitor/shared';

interface LimitsConfigProps {
  limits: LimitConfig;
  onChange: (partial: Partial<LimitConfig>) => void;
}

// 表单以 KB 展示 body 上限，内部按字符数存储（1 KB = 1000 字符）
const CHARS_PER_KB = 1000;

export default function LimitsConfig({ limits, onChange }: LimitsConfigProps) {
  const [bodyDraft, setBodyDraft] = useState(String(Math.round(limits.maxBodySize / CHARS_PER_KB)));
  const [requestsDraft, setRequestsDraft] = useState(String(limits.maxRequests));

  // 外部变更（其他窗口/设备同步）时回填，保持表单与真实配置一致
  useEffect(() => {
    setBodyDraft(String(Math.round(limits.maxBodySize / CHARS_PER_KB)));
  }, [limits.maxBodySize]);

  useEffect(() => {
    setRequestsDraft(String(limits.maxRequests));
  }, [limits.maxRequests]);

  const commitBody = () => {
    const raw = bodyDraft.trim();
    const kb = Number(raw);
    if (raw === '' || !Number.isFinite(kb)) {
      // 空串/非法输入不提交，直接回填当前生效值，避免被归一化成下限而误删记录
      setBodyDraft(String(Math.round(limits.maxBodySize / CHARS_PER_KB)));
      return;
    }
    const normalized = normalizeLimit('maxBodySize', kb * CHARS_PER_KB);
    setBodyDraft(String(Math.round(normalized / CHARS_PER_KB)));
    if (normalized !== limits.maxBodySize) onChange({ maxBodySize: normalized });
  };

  const commitRequests = () => {
    const raw = requestsDraft.trim();
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value)) {
      setRequestsDraft(String(limits.maxRequests));
      return;
    }
    const normalized = normalizeLimit('maxRequests', value);
    setRequestsDraft(String(normalized));
    if (normalized !== limits.maxRequests) onChange({ maxRequests: normalized });
  };

  // 回车提交等价于失焦，避免误触表单默认行为
  const submitOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <div className="panel">
      <div className="panel-title">Storage limits</div>

      <div className="field">
        <label className="field-label" htmlFor="max-body-size">Max body size (KB)</label>
        <input
          id="max-body-size"
          className="text-input"
          type="number"
          min={LIMIT_BOUNDS.maxBodySize.min / CHARS_PER_KB}
          max={LIMIT_BOUNDS.maxBodySize.max / CHARS_PER_KB}
          step={LIMIT_BOUNDS.maxBodySize.step / CHARS_PER_KB}
          value={bodyDraft}
          onChange={(e) => setBodyDraft(e.target.value)}
          onBlur={commitBody}
          onKeyDown={submitOnEnter}
        />
        <div className="hint">
          Per request/response body · 1 KB = 1000 chars
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="max-requests">Max requests</label>
        <input
          id="max-requests"
          className="text-input"
          type="number"
          min={LIMIT_BOUNDS.maxRequests.min}
          max={LIMIT_BOUNDS.maxRequests.max}
          step={LIMIT_BOUNDS.maxRequests.step}
          value={requestsDraft}
          onChange={(e) => setRequestsDraft(e.target.value)}
          onBlur={commitRequests}
          onKeyDown={submitOnEnter}
        />
        <div className="hint">
          Oldest requests are dropped first · {LIMIT_BOUNDS.maxRequests.min}–{LIMIT_BOUNDS.maxRequests.max}
        </div>
      </div>
    </div>
  );
}
