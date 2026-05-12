import { useState } from "react";
import type { RequestRecord } from "@request-monitor/shared";
import { useRequests } from "./hooks/useRequests";
import { useFilter } from "./hooks/useFilter";
import Toolbar from "./components/Toolbar";
import RequestTable from "./components/RequestTable";
import RequestDetail from "./components/RequestDetail";
import StatusBar from "./components/StatusBar";

export default function App() {
  const { requests, clearRequests } = useRequests();
  const { filteredRequests, filters, setFilters } = useFilter(requests);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDecryptInput, setShowDecryptInput] = useState(false);
  const [decryptUrl, setDecryptUrl] = useState('');

  const selectedRecord = selectedId
    ? requests.find((r) => r.id === selectedId)
    : null;

  const handleSelect = (record: RequestRecord) => {
    setSelectedId(record.id);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Toolbar
        filters={filters}
        onFilterChange={setFilters}
        onClear={clearRequests}
      />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        borderBottom: '1px solid #eee',
        background: '#f5f5f5',
        fontSize: '11px',
      }}>
        <button
          onClick={() => setShowDecryptInput(!showDecryptInput)}
          style={{
            padding: '2px 8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            background: decryptUrl ? '#fff3e0' : '#fff',
            color: decryptUrl ? '#e65100' : '#999',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          {showDecryptInput ? 'Hide Decrypt' : 'Decrypt'}
        </button>
        {showDecryptInput && (
          <input
            type="text"
            placeholder="Decrypt API URL (e.g. http://localhost:3000/decrypt)"
            value={decryptUrl}
            onChange={(e) => setDecryptUrl(e.target.value)}
            style={{
              flex: 1,
              padding: '3px 6px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '11px',
              fontFamily: 'monospace',
            }}
          />
        )}
        {decryptUrl && !showDecryptInput && (
          <span style={{ color: '#e65100', fontSize: '11px' }}>API set</span>
        )}
      </div>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <RequestTable
          requests={filteredRequests}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
        {selectedRecord && (
          <div
            style={{
              minWidth: "400px",
              borderLeft: "1px solid #ddd",
              overflow: "auto",
              flex: 2,
            }}
          >
            <RequestDetail record={selectedRecord} decryptUrl={decryptUrl} />
          </div>
        )}
      </div>
      <StatusBar total={requests.length} filtered={filteredRequests.length} />
    </div>
  );
}
