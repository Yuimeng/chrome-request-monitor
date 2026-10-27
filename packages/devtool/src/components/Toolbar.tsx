/**
 * 模块：devtool / components / Toolbar —— 顶部工具栏
 *
 * 组成：
 *   - 隐藏的 <input type=file>  接受 .har/.json 文件，经 parseHar 后回调 onImport
 *   - 搜索框（带放大镜图标）  按 URL 子串过滤
 *   - method/status/type 三个下拉框  组装为 FilterConfig 上抛
 *   - 排序字段下拉框 + 方向按钮  字段（Time/Method/Status/Duration/Path）× 正序/倒序
 *   - Clear / Import HAR 按钮  清空缓冲、导入 HAR
 *
 * 协作：纯受控组件；过滤值来自 App 的 useFilter，导入逻辑复用 utils/har。
 */
import { useRef } from 'react';
import { FILTER_OPTIONS, LABELS, SORT_OPTIONS } from '../utils/constants';
import type { SortKey } from '../utils/constants';
import { parseHar } from '../utils/har';
import type { SortState } from '../hooks/useFilter';
import type { FilterConfig, RequestRecord } from '@request-monitor/shared';

interface ToolbarProps {
  filters: FilterConfig;
  onFilterChange: (filters: FilterConfig) => void;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  onClear: () => void;
  onImport: (records: RequestRecord[]) => void;
}

export default function Toolbar({ filters, onFilterChange, sort, onSortChange, onClear, onImport }: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = (partial: Partial<FilterConfig>) => {
    onFilterChange({ ...filters, ...partial });
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const records = parseHar(text);
        onImport(records);
      } catch (err) {
        alert('Import failed: ' + (err instanceof Error ? err.message : 'Invalid file'));
      }
    };
    reader.readAsText(file);

    // Reset so the same file can be re-imported
    e.target.value = '';
  };

  return (
    <div className="toolbar">
      <input
        ref={fileInputRef}
        type="file"
        accept=".har,application/json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div className="search">
        <svg
          className="search-icon"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <input
          className="search-input"
          type="text"
          placeholder="Filter by URL…"
          aria-label="Filter by URL"
          value={filters.urlFilter}
          onChange={(e) => update({ urlFilter: e.target.value })}
        />
      </div>

      <select
        className="select"
        aria-label="Filter by method"
        value={filters.methodFilter}
        onChange={(e) => update({ methodFilter: e.target.value })}
      >
        <option value="">Any method</option>
        {FILTER_OPTIONS.method.slice(1).map((m) => (
          <option key={m} value={m}>{LABELS[m] || m}</option>
        ))}
      </select>

      <select
        className="select"
        aria-label="Filter by status"
        value={filters.statusFilter}
        onChange={(e) => update({ statusFilter: e.target.value })}
      >
        <option value="">Any status</option>
        {FILTER_OPTIONS.status.slice(1).map((s) => (
          <option key={s} value={s}>{LABELS[s] || s}</option>
        ))}
      </select>

      <select
        className="select"
        aria-label="Filter by type"
        value={filters.typeFilter}
        onChange={(e) => update({ typeFilter: e.target.value })}
      >
        <option value="">Any type</option>
        {FILTER_OPTIONS.type.slice(1).map((t) => (
          <option key={t} value={t}>{LABELS[t] || t}</option>
        ))}
      </select>

      <select
        className="select"
        aria-label="Sort by"
        title="Sort by"
        value={sort.key}
        onChange={(e) => onSortChange({ ...sort, key: e.target.value as SortKey })}
      >
        {SORT_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>

      <button
        type="button"
        className="btn btn-icon"
        onClick={() => onSortChange({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}
        title={sort.direction === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
        aria-label={sort.direction === 'asc' ? 'Sort ascending, click to switch to descending' : 'Sort descending, click to switch to ascending'}
      >
        {sort.direction === 'asc' ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="m19 12-7 7-7-7" />
          </svg>
        )}
      </button>

      <div className="toolbar-spacer" />

      <button type="button" className="btn" onClick={onClear}>
        Clear
      </button>
      <button type="button" className="btn btn-primary" onClick={handleImport}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
        Import HAR
      </button>
    </div>
  );
}
