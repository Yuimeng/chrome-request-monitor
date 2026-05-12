import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { RequestRecord } from '@request-monitor/shared';
import { formatDuration, formatUrl, getDurationColor, getStatusColor } from '../utils/formatters';

interface RequestTableProps {
  requests: RequestRecord[];
  selectedId: string | null;
  onSelect: (record: RequestRecord) => void;
}

export default function RequestTable({ requests, selectedId, onSelect }: RequestTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: requests.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
  });

  return (
    <div ref={parentRef} style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const req = requests[virtualItem.index];
          const { pathname, full } = formatUrl(req.url);
          const isSelected = req.id === selectedId;

          return (
            <div
              key={req.id}
              onClick={() => onSelect(req)}
              title={full}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0 8px',
                fontSize: '12px',
                fontFamily: 'monospace',
                cursor: 'pointer',
                background: isSelected ? '#e3f2fd' : virtualItem.index % 2 === 0 ? '#fff' : '#f8f9fa',
                borderBottom: '1px solid #eee',
                whiteSpace: 'nowrap',
                boxSizing: 'border-box',
              }}
            >
              <span style={{ width: '60px', color: '#1976D2', fontWeight: 600, flexShrink: 0 }}>
                {req.method}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', color: '#333' }}>
                {pathname}
              </span>
              <span style={{ width: '36px', textAlign: 'right', color: getStatusColor(req.responseStatus), fontWeight: 600, flexShrink: 0 }}>
                {req.responseStatus || 'ERR'}
              </span>
              <span style={{ width: '36px', textAlign: 'right', color: '#666', flexShrink: 0 }}>
                {req.type === 'fetch' ? 'FETCH' : 'XHR'}
              </span>
              <span style={{ width: '60px', textAlign: 'right', color: getDurationColor(req.duration), flexShrink: 0 }}>
                {formatDuration(req.duration)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
