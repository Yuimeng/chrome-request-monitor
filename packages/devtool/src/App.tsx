import { useState } from "react";
import type { RequestRecord } from "@request-monitor/shared";
import { STORAGE_KEYS } from "@request-monitor/shared";
import { useRequests } from "./hooks/useRequests";
import { useFilter } from "./hooks/useFilter";
import { useStorage } from "./hooks/useStorage";
import Toolbar from "./components/Toolbar";
import RequestTable from "./components/RequestTable";
import RequestDetail from "./components/RequestDetail";
import StatusBar from "./components/StatusBar";

export default function App() {
  const { requests, clearRequests } = useRequests();
  const { filteredRequests, filters, setFilters } = useFilter(requests);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decryptUrl] = useStorage(STORAGE_KEYS.DECRYPT_URL, "");

  const selectedRecord = selectedId ? requests.find((r) => r.id === selectedId) : null;

  const handleSelect = (record: RequestRecord) => {
    setSelectedId(selectedId === record.id ? "" : record.id);
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
      <Toolbar filters={filters} onFilterChange={setFilters} onClear={clearRequests} />
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
            <RequestDetail record={selectedRecord} decryptUrl={decryptUrl} />
          </div>
        )}
      </div>
      <StatusBar total={requests.length} filtered={filteredRequests.length} />
    </div>
  );
}
