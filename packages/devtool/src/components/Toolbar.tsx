import { useRef } from 'react';
import { FILTER_OPTIONS, LABELS } from '../utils/constants';
import { parseHar } from '../utils/har';
import type { FilterConfig, RequestRecord } from '@request-monitor/shared';

interface ToolbarProps {
  filters: FilterConfig;
  onFilterChange: (filters: FilterConfig) => void;
  onClear: () => void;
  onImport: (records: RequestRecord[]) => void;
}

export default function Toolbar({ filters, onFilterChange, onClear, onImport }: ToolbarProps) {
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
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      borderBottom: '1px solid #ddd',
      background: '#fafafa',
      flexWrap: 'wrap',
    }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".har,application/json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <input
        type="text"
        placeholder="Filter URL..."
        value={filters.urlFilter}
        onChange={(e) => update({ urlFilter: e.target.value })}
        style={{
          flex: '1 1 200px',
          padding: '4px 8px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace',
        }}
      />
      <select
        value={filters.methodFilter}
        onChange={(e) => update({ methodFilter: e.target.value })}
        style={{
          padding: '4px 6px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontSize: '12px',
          background: '#fff',
        }}
      >
        {FILTER_OPTIONS.method.map((m) => (
          <option key={m} value={m}>{LABELS[m] || m}</option>
        ))}
      </select>
      <select
        value={filters.statusFilter}
        onChange={(e) => update({ statusFilter: e.target.value })}
        style={{
          padding: '4px 6px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontSize: '12px',
          background: '#fff',
        }}
      >
        {FILTER_OPTIONS.status.map((s) => (
          <option key={s} value={s}>{LABELS[s] || s}</option>
        ))}
      </select>
      <select
        value={filters.typeFilter}
        onChange={(e) => update({ typeFilter: e.target.value })}
        style={{
          padding: '4px 6px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontSize: '12px',
          background: '#fff',
        }}
      >
        {FILTER_OPTIONS.type.map((t) => (
          <option key={t} value={t}>{LABELS[t] || t}</option>
        ))}
      </select>
      <button onClick={onClear} style={{
        padding: '4px 12px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        fontSize: '12px',
        background: '#fff',
        cursor: 'pointer',
      }}>
        Clear
      </button>
      <button onClick={handleImport} style={{
        padding: '4px 12px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        fontSize: '12px',
        background: '#e3f2fd',
        cursor: 'pointer',
      }}>
        Import HAR
      </button>
    </div>
  );
}
