/**
 * 模块：popup / components / FilterConfig —— 抓取过滤配置表单
 *
 * 组成：
 *   - URL Pattern 文本框（子串匹配，如 /api/）
 *   - fetch / XHR 两个捕获开关复选框
 *   - Methods 按钮组：空数组 = 不限方法；点击切换白名单（toggleMethod）
 *
 * 协作：受控组件，草稿在 App（draftFilter）中维护，点"确定"才写入 storage，
 *   避免每敲一个字符就触发 main-world 重新匹配。
 */
import type { CaptureFilter } from '@request-monitor/shared';

interface FilterConfigProps {
  filter: CaptureFilter;
  onChange: (filter: CaptureFilter) => void;
}

const ALL_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];

export default function FilterConfig({ filter, onChange }: FilterConfigProps) {
  const update = (partial: Partial<CaptureFilter>) => {
    onChange({ ...filter, ...partial });
  };

  const toggleMethod = (method: string) => {
    const methods = filter.methods.includes(method)
      ? filter.methods.filter((m) => m !== method)
      : [...filter.methods, method];
    update({ methods });
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      padding: '10px 12px',
      background: '#f9f9f9',
      borderRadius: '8px',
      fontSize: '13px',
    }}>
      <div style={{ fontWeight: 600, color: '#555', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Filters
      </div>

      <div>
        <label style={{ display: 'block', color: '#666', marginBottom: '4px', fontSize: '12px' }}>
          URL Pattern
        </label>
        <input
          type="text"
          placeholder="e.g. /api/ or example.com"
          value={filter.urlPattern}
          onChange={(e) => update({ urlPattern: e.target.value })}
          style={{
            width: '100%',
            padding: '5px 8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'monospace',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#555' }}>
          <input
            type="checkbox"
            checked={filter.captureFetch}
            onChange={(e) => update({ captureFetch: e.target.checked })}
          />
          fetch
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#555' }}>
          <input
            type="checkbox"
            checked={filter.captureXHR}
            onChange={(e) => update({ captureXHR: e.target.checked })}
          />
          XHR
        </label>
      </div>

      <div>
        <label style={{ display: 'block', color: '#666', marginBottom: '4px', fontSize: '12px' }}>
          Methods
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {ALL_METHODS.map((method) => (
            <button
              key={method}
              onClick={() => toggleMethod(method)}
              style={{
                padding: '2px 8px',
                border: `1px solid ${filter.methods.length === 0 || filter.methods.includes(method) ? '#4CAF50' : '#ddd'}`,
                borderRadius: '4px',
                background: filter.methods.length === 0 || filter.methods.includes(method) ? '#E8F5E9' : '#fff',
                color: filter.methods.length === 0 || filter.methods.includes(method) ? '#2E7D32' : '#999',
                fontSize: '11px',
                cursor: 'pointer',
                fontFamily: 'monospace',
              }}
            >
              {method}
            </button>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
          {filter.methods.length === 0 ? 'All methods selected (click to restrict)' : `Only: ${filter.methods.join(', ')}`}
        </div>
      </div>
    </div>
  );
}
