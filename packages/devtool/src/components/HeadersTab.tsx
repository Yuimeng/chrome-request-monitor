interface HeadersTabProps {
  headers: [string, string][];
  title: string;
}

export default function HeadersTab({ headers, title }: HeadersTabProps) {
  if (headers.length === 0) {
    return (
      <p style={{ padding: '12px', color: '#999', fontSize: '12px' }}>
        No {title.toLowerCase()} available
      </p>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
      <thead>
        <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
          <th style={{ padding: '6px 12px', textAlign: 'left', color: '#666', width: '250px' }}>Name</th>
          <th style={{ padding: '6px 12px', textAlign: 'left', color: '#666' }}>Value</th>
        </tr>
      </thead>
      <tbody>
        {headers.map(([name, value], i) => (
          <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '4px 12px', color: '#8B4513', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              {name}
            </td>
            <td style={{ padding: '4px 12px', color: '#333', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
