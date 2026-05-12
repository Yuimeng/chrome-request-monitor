interface StatusBadgeProps {
  enabled: boolean;
  count: number;
}

export default function StatusBadge({ enabled, count }: StatusBadgeProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      padding: '8px 12px',
      background: enabled ? '#E8F5E9' : '#F5F5F5',
      borderRadius: '8px',
      fontSize: '13px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: enabled ? '#4CAF50' : '#999',
        }} />
        <span style={{ color: enabled ? '#2E7D32' : '#666' }}>
          {enabled ? 'Running' : 'Stopped'}
        </span>
      </div>
      <div style={{ color: '#666' }}>
        Captured: <strong>{count}</strong> requests
      </div>
    </div>
  );
}
