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
  const [draftFilter, setDraftFilter] = useState<CaptureFilter>(DEFAULT_FILTER);
  const [decryptUrl, setDecryptUrl] = useStorage(STORAGE_KEYS.DECRYPT_URL, '');

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
          <>
            <FilterConfig filter={draftFilter} onChange={setDraftFilter} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setDraftFilter(filter); setShowFilters(false); }}
                style={{
                  padding: '6px 16px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  background: '#fff',
                  color: '#666',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setFilter(draftFilter); setShowFilters(false); }}
                style={{
                  padding: '6px 16px',
                  border: '1px solid #4CAF50',
                  borderRadius: '4px',
                  background: '#4CAF50',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                确定
              </button>
            </div>
          </>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
          <label style={{ color: '#999', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Decrypt API URL
          </label>
          <input
            type="text"
            placeholder="http://localhost:3000/decrypt"
            value={decryptUrl}
            onChange={(e) => setDecryptUrl(e.target.value)}
            style={{
              width: '100%',
              padding: '5px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '11px',
              fontFamily: 'monospace',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>
    </div>
  );
}
