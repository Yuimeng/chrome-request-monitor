/**
 * 模块：devtool / components / StatusBar —— 底部状态栏
 *
 * 组成：左侧请求计数（过滤生效时显示 "filtered of total requests"）；
 *   右侧在有选中记录时显示 "METHOD /path"，否则提示可点击查看详情。
 * 协作：App 传入 requests 总数、filteredRequests 数与当前选中的 record。
 */
import type { RequestRecord } from '@request-monitor/shared';
import { formatUrl } from '../utils/formatters';

interface StatusBarProps {
  total: number;
  filtered: number;
  selected?: RequestRecord | null;
}

export default function StatusBar({ total, filtered, selected }: StatusBarProps) {
  const isFiltered = total !== filtered;
  const selectedPath = selected ? formatUrl(selected.url).pathname : '';

  return (
    <div className="statusbar">
      <span className="statusbar-count">
        {isFiltered ? (
          <>
            <strong>{filtered}</strong> of {total} requests
          </>
        ) : (
          <>
            <strong>{total}</strong> {total === 1 ? 'request' : 'requests'}
          </>
        )}
      </span>
      <span className="statusbar-meta">
        {selected ? (
          <span className="statusbar-selected" title={selected.url}>
            <span className="statusbar-method">{selected.method}</span>
            <span className="statusbar-path">{selectedPath}</span>
          </span>
        ) : (
          <>
            {isFiltered && <span>Filter active</span>}
            {isFiltered && <span className="statusbar-dot" />}
            <span>{total > 0 ? 'Select a row to inspect' : 'Waiting for requests…'}</span>
          </>
        )}
      </span>
    </div>
  );
}
