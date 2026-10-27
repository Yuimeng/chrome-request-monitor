/**
 * 模块：popup / components / StatusBadge —— 运行状态卡片
 *
 * 组成：
 *   - 状态胶囊（Running / Stopped）  绿点表示正在抓取
 *   - 计数（已捕获 / 条数上限）      上限来自 Limits 配置，直观展示淘汰阈值
 *   - 占用进度条                    接近上限转橙、已满转红，提示即将开始淘汰旧记录
 * 协作：App 传入 enabled、轮询得到的 count 与配置的 maxRequests。
 */
interface StatusBadgeProps {
  enabled: boolean;
  count: number;
  /** 最多保留的条数；未传时只显示计数、不显示进度条 */
  max?: number;
}

export default function StatusBadge({ enabled, count, max }: StatusBadgeProps) {
  const ratio = max && max > 0 ? Math.min(1, count / max) : 0;
  const meterClass = [
    'meter-fill',
    ratio >= 1 ? 'is-full' : ratio >= 0.8 ? 'is-near' : '',
  ].filter(Boolean).join(' ');

  return (
    <section className="card status-card">
      <div className="status-line">
        <span className={enabled ? 'status-pill is-running' : 'status-pill'}>
          <span className="dot" />
          {enabled ? 'Running' : 'Stopped'}
        </span>
        <span className="count">
          <strong>{count}</strong>
          {max ? (
            <>
              <span className="count-sep">/</span>
              {max}
            </>
          ) : null}
          {' requests'}
        </span>
      </div>
      {max ? (
        <div className="meter" title={`Buffer usage ${Math.round(ratio * 100)}%`}>
          <div className={meterClass} style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
      ) : null}
    </section>
  );
}
