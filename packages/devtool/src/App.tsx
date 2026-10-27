/**
 * 模块：devtool / App —— DevTools 面板根组件（布局与交互编排）
 *
 * 组成：
 *   - useRequests   数据源（Port 长连接）
 *   - useFilter     展示过滤
 *   - Toolbar       顶部工具栏（过滤条件、清空、导入 HAR）
 *   - RequestTable  左侧虚拟滚动请求列表
 *   - RequestDetail 右侧详情面板（可拖拽调宽，默认 60% 面板宽，范围 320px ~ 面板宽-220px）
 *   - StatusBar     底部计数状态栏
 *   - 拖拽导入      dragenter/leave/over/drop 四个 handler + dragCounter 解决子元素
 *     触发 leave 导致的误判；drop 后经 parseHar 导入
 *
 * 协作：向下分发数据与回调；decryptUrl 从 storage 读取后传给 RequestDetail 用于解密。
 */
import { useState, useRef, useCallback, useEffect } from "react";
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

// 详情面板宽度策略：默认占面板 60%，拖拽范围 [320, 面板宽 - 220]
// 上限不再固定 800px——宽屏下用户可以把右侧拉得更宽看长 Cookie / JSON，
// 同时始终为左侧列表保留至少 220px，避免拖到列表完全不可用。
const MIN_DETAIL_WIDTH = 320;
const MIN_TABLE_WIDTH = 220;
const DEFAULT_DETAIL_RATIO = 0.6;

function clampDetailWidth(width: number): number {
  const max = Math.max(MIN_DETAIL_WIDTH, window.innerWidth - MIN_TABLE_WIDTH);
  return Math.min(Math.max(MIN_DETAIL_WIDTH, Math.round(width)), max);
}

export default function App() {
  const { requests, clearRequests, importRequests } = useRequests();
  const { filteredRequests, filters, setFilters, sort, setSort } = useFilter(requests);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decryptUrl] = useStorage(STORAGE_KEYS.DECRYPT_URL, "");
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);
  const [detailWidth, setDetailWidth] = useState(() =>
    clampDetailWidth(window.innerWidth * DEFAULT_DETAIL_RATIO),
  );
  const isResizing = useRef(false);

  // 面板/窗口尺寸变化（DevTools 停靠切换、分屏）时重新收敛宽度，避免右栏超出可视区
  useEffect(() => {
    const handleWindowResize = () => setDetailWidth((width) => clampDetailWidth(width));
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startW = detailWidth;

    const handleMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      setDetailWidth(clampDetailWidth(startW + (startX - e.clientX)));
    };

    const handleUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [detailWidth]);

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
      className="app"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Toolbar
        filters={filters}
        onFilterChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        onClear={handleClear}
        onImport={importRequests}
      />
      <div className="workspace">
        <RequestTable
          requests={filteredRequests}
          selectedId={selectedId}
          onSelect={handleSelect}
          scrollResetKey={`${sort.key}:${sort.direction}`}
          style={selectedId ? { flex: "1 1 400px", minWidth: 200 } : undefined}
        />
        {selectedRecord && (
          <>
            <div className="resizer" onMouseDown={handleResizeStart} />
            <div className="detail" style={{ width: detailWidth }}>
              <RequestDetail record={selectedRecord} decryptUrl={decryptUrl} onClose={() => setSelectedId(null)} />
            </div>
          </>
        )}
      </div>
      <StatusBar total={requests.length} filtered={filteredRequests.length} selected={selectedRecord} />
      {isDragOver && (
        <div className="drop-overlay">
          <span className="drop-card">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V4" />
              <path d="m7 9 5-5 5 5" />
              <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            Drop HAR file to import
          </span>
        </div>
      )}
    </div>
  );
}
