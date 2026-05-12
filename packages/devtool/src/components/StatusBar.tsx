interface StatusBarProps {
  total: number;
  filtered: number;
}

export default function StatusBar({ total, filtered }: StatusBarProps) {
  return (
    <div style={{
      padding: '4px 12px',
      borderTop: '1px solid #ddd',
      background: '#fafafa',
      fontSize: '11px',
      color: '#666',
      fontFamily: 'monospace',
    }}>
      {total === filtered
        ? `${total} requests`
        : `${filtered} / ${total} requests`
      }
    </div>
  );
}
