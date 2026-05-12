interface BodyTabProps {
  body: string | undefined;
  label: string;
}

export default function BodyTab({ body, label }: BodyTabProps) {
  if (!body) {
    return (
      <p style={{ padding: '12px', color: '#999', fontSize: '12px' }}>
        No {label.toLowerCase()} available
      </p>
    );
  }

  let formatted = body;
  let isJson = false;
  try {
    formatted = JSON.stringify(JSON.parse(body), null, 2);
    isJson = true;
  } catch {
    // not JSON, show raw
  }

  return (
    <pre style={{
      margin: 0,
      padding: '12px',
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#333',
      overflow: 'auto',
      maxHeight: '300px',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      background: '#fafafa',
    }}>
      {formatted}
    </pre>
  );
}
