/**
 * 模块：popup / components / StatusBadge —— 运行状态徽标
 *
 * 组成：绿点/灰点表示 Running/Stopped + 已捕获请求计数（含条数上限，如 128 / 500）。
 * 协作：App 传入 enabled、轮询得到的 count 与配置的 maxRequests，
 *   上限随 popup 的 Limits 配置变化，用于直观判断缓冲是否已接近淘汰阈值。
 */
interface StatusBadgeProps {
  enabled: boolean;
  count: number;
  /** 最多保留的条数；未传时只显示计数 */
  max?: number;
}

export default function StatusBadge({ enabled, count, max }: StatusBadgeProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      padding: '8px 12px',
      background: enabled ? '#E8F5E9' : '#F5F5F5',
      borderRadius: '8px',
      fontSize: '13px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: enabled ? '#4CAF50' : '#999',
        }} />
        <span style={{ color: enabled ? '#2E7D32' : '#666' }}>
          {enabled ? 'Running' : 'Stopped'}
        </span>
      </div>
      <div style={{ color: '#666' }}>
        Captured: <strong>{count}</strong>
        {max !== undefined ? ` / ${max}` : ''} requests
      </div>
    </div>
  );
}
