/**
 * 模块：devtool / components / StatusBar —— 底部状态栏
 *
 * 组成：显示 "N requests"，过滤生效时显示 "filtered / total requests"。
 * 协作：App 传入 requests 总数与 filteredRequests 数。
 */
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
