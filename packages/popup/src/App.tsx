import { useEffect, useState } from 'react';
import { STORAGE_KEYS, MESSAGE_TYPES } from '@request-monitor/shared';
import type { CaptureFilter } from '@request-monitor/shared';
import { useStorage } from './hooks/useStorage';
import ToggleSwitch from './components/ToggleSwitch';
import StatusBadge from './components/StatusBadge';
import FilterConfig from './components/FilterConfig';

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

  const hasActiveFilters = filter.urlPattern || !filter.captureFetch || !filter.captureXHR || filter.methods.length > 0;

  if (loading || filterLoading) {
    return (
      <div style={{ width: '280px', padding: '16px', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ width: '280px', padding: '16px', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ margin: '0 0 16px', fontSize: '16px', color: '#333' }}>
        Request Monitor
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <ToggleSwitch enabled={enabled} onChange={setEnabled} />
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: '4px 8px',
              border: `1px solid ${hasActiveFilters ? '#4CAF50' : '#ddd'}`,
              borderRadius: '4px',
              background: showFilters ? '#e3f2fd' : '#fff',
              color: hasActiveFilters ? '#2E7D32' : '#666',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Filters {hasActiveFilters ? '●' : ''}
          </button>
        </div>
        <StatusBadge enabled={enabled} count={count} />
        {showFilters && (
          <FilterConfig filter={filter} onChange={setFilter} />
        )}
      </div>
    </div>
  );
}
