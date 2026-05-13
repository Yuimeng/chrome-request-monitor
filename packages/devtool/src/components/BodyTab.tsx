import { useState } from 'react';

interface BodyTabProps {
  body: string | undefined;
  label: string;
  decryptPayload?: unknown;
  decryptUrl?: string;
}

export default function BodyTab({ body, label, decryptPayload, decryptUrl }: BodyTabProps) {
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = decrypted ?? body;
    if (!text) return;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDecrypt = async () => {
    if (!decryptUrl || !decryptPayload) return;
    setDecrypting(true);
    setDecryptError(null);
    try {
      const res = await fetch(decryptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decryptPayload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setDecrypted(text);
    } catch (err) {
      setDecryptError(err instanceof Error ? err.message : 'Decrypt failed');
    } finally {
      setDecrypting(false);
    }
  };

  const content = decrypted ?? body;

  if (!content) {
    return (
      <p style={{ padding: '12px', color: '#999', fontSize: '12px' }}>
        No {label.toLowerCase()} available
      </p>
    );
  }

  let formatted = content;
  try {
    formatted = JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    // not JSON, show raw
  }

  return (
    <div>
      <div style={{ padding: '8px 12px 0', display: 'flex', gap: '6px', alignItems: 'center' }}>
        <button
          onClick={handleCopy}
          style={{
            padding: '3px 10px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            background: copied ? '#e8f5e9' : '#fff',
            color: copied ? '#2e7d32' : '#666',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        {decryptUrl && decryptPayload && (
          <button
            onClick={handleDecrypt}
            disabled={decrypting}
            style={{
              padding: '3px 10px',
              border: '1px solid #ff9800',
              borderRadius: '4px',
              background: decrypting ? '#fff3e0' : '#fff8e1',
              color: '#e65100',
              fontSize: '11px',
              cursor: decrypting ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            {decrypting ? 'Decrypting...' : 'Decrypt'}
          </button>
        )}
        {decryptUrl && decryptPayload && decrypted && (
          <button
            onClick={() => { setDecrypted(null); setDecryptError(null); }}
            style={{
              padding: '3px 10px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: '#fff',
              color: '#666',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Original
          </button>
        )}
        {decryptError && (
          <span style={{ color: '#d32f2f', fontSize: '11px' }}>{decryptError}</span>
        )}
      </div>
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
        background: decrypted ? '#fffde7' : '#fafafa',
      }}>
        {formatted}
      </pre>
    </div>
  );
}
