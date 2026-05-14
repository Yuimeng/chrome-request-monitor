import { useState, useRef, useCallback } from "react";
import type { RequestRecord } from "@request-monitor/shared";
import { MESSAGE_TYPES, STORAGE_KEYS } from "@request-monitor/shared";
import { useRequests } from "./hooks/useRequests";
import { useFilter } from "./hooks/useFilter";
import { useStorage } from "./hooks/useStorage";
import { parseHar } from "./utils/har";
import Toolbar from "./components/Toolbar";
import RequestTable from "./components/RequestTable";
import RequestDetail from "./components/RequestDetail";
import StatusBar from "./components/StatusBar";

export default function App() {
  const { requests, clearRequests, importRequests } = useRequests();
  const { filteredRequests, filters, setFilters } = useFilter(requests);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decryptUrl] = useStorage(STORAGE_KEYS.DECRYPT_URL, "");
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const selectedRecord = selectedId ? requests.find((r) => r.id === selectedId) : null;

  const handleSelect = (record: RequestRecord) => {
    setSelectedId(selectedId === record.id ? "" : record.id);
  };

  const handleClear = () => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CLEAR_REQUESTS });
    clearRequests();
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounter.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const records = parseHar(text);
        importRequests(records);
      } catch (err) {
        alert('Import HAR failed: ' + (err instanceof Error ? err.message : 'Invalid file'));
      }
    };
    reader.readAsText(file);
  }, [importRequests]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        position: "relative",
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Toolbar filters={filters} onFilterChange={setFilters} onClear={handleClear} onImport={importRequests} />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <RequestTable requests={filteredRequests} selectedId={selectedId} onSelect={handleSelect} />
        {selectedRecord && (
          <div
            style={{
              minWidth: "400px",
              borderLeft: "1px solid #ddd",
              overflow: "auto",
              flex: 2,
            }}
          >
            <RequestDetail record={selectedRecord} decryptUrl={decryptUrl} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>
      <StatusBar total={requests.length} filtered={filteredRequests.length} />
      {isDragOver && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(33, 150, 243, 0.08)",
            border: "3px dashed #1976D2",
            borderRadius: "8px",
            margin: "8px",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              fontSize: "20px",
              fontWeight: 600,
              color: "#1976D2",
              background: "#fff",
              padding: "12px 24px",
              borderRadius: "8px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
            }}
          >
            Drop HAR file to import
          </span>
        </div>
      )}
    </div>
  );
}
