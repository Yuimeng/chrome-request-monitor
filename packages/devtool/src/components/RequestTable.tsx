/**
 * 模块：devtool / components / RequestTable —— 请求列表（虚拟滚动）
 *
 * 组成：
 *   - 表头（.table-head）  固定列宽：Method / Path / Status / Type，与行内列一一对应
 *   - useVirtualizer（@tanstack/react-virtual）  仅渲染可视区行，支撑大列表流畅滚动；
 *     行高与 App.css 的 --row-height 保持一致（ROW_HEIGHT 常量）
 *   - 行内容：method 彩色标签 / 路径（查询串弱化）/ 状态码（语义配色）/ 类型标签
 *   - 空状态：无数据时给出启用监控与拖入 HAR 的引导，而不是一片空白
 *
 * 协作：接收 useFilter 过滤后的数组；点击行 → onSelect → App 更新 selectedId → 右侧显示 RequestDetail。
 */
import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { RequestRecord } from '@request-monitor/shared';
import { formatUrl, statusTone } from '../utils/formatters';

// 与 App.css 的 --row-height 必须一致，否则虚拟滚动定位会错位
const ROW_HEIGHT = 30;

const TYPE_LABEL: Record<RequestRecord['type'], string> = {
  fetch: 'fetch',
  xhr: 'xhr',
  har: 'har',
};

interface RequestTableProps {
  requests: RequestRecord[];
  selectedId: string | null;
  onSelect: (record: RequestRecord) => void;
  style?: React.CSSProperties;
  /** 排序标识变化时回到列表顶部（排序后停留在旧滚动位置会看到错乱的切片） */
  scrollResetKey?: string;
}

export default function RequestTable({ requests, selectedId, onSelect, style, scrollResetKey }: RequestTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: requests.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 });
  }, [scrollResetKey]);

  return (
    <div className="table" style={style}>
      <div className="table-head">
        <span className="col-method">Method</span>
        <span className="col-path">Path</span>
        <span className="col-status">Status</span>
        <span className="col-type">Type</span>
      </div>

      {requests.length === 0 ? (
        <div className="empty">
          <svg className="empty-icon" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12h4l3 8 4-16 3 8h4" />
          </svg>
          <div className="empty-title">No requests captured</div>
          <div className="empty-hint">
            Turn on monitoring from the extension popup,
            <br />
            or drop a HAR file here to import.
          </div>
        </div>
      ) : (
        <div ref={parentRef} className="table-body">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const req = requests[virtualItem.index];
              const { pathname, full } = formatUrl(req.url);
              const queryIndex = pathname.indexOf('?');
              const path = queryIndex >= 0 ? pathname.slice(0, queryIndex) : pathname;
              const query = queryIndex >= 0 ? pathname.slice(queryIndex) : '';
              const isSelected = req.id === selectedId;
              const tone = statusTone(req.responseStatus);

              return (
                <div
                  key={req.id}
                  onClick={() => onSelect(req)}
                  title={full}
                  className={[
                    'row',
                    // 斑马纹按数据下标而非 DOM 顺序：虚拟滚动下 DOM 节点会随滚动重建，
                    // 用 :nth-child 会导致条纹随滚动位置跳变
                    virtualItem.index % 2 === 1 ? 'is-alt' : '',
                    isSelected ? 'is-selected' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <span className="col-method">
                    <span className="row-method" data-method={req.method}>
                      {req.method}
                    </span>
                  </span>
                  <span className="row-path">
                    {path}
                    {query && <span className="row-query">{query}</span>}
                  </span>
                  <span className={`row-status status-${tone}`}>
                    {req.responseStatus || 'ERR'}
                  </span>
                  <span className="col-type">
                    <span className="type-chip">{TYPE_LABEL[req.type] ?? req.type}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
