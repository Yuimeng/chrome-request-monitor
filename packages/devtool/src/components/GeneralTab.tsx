/**
 * 模块：devtool / components / GeneralTab —— 概览标签页
 *
 * 组成：URL/Method/Status/Duration/Start Time/Type 六行键值表。
 *   Start Time 优先用 record.sentAt（页面侧记录的实际发起时刻，epoch ms）；
 *   HAR 导入 / 旧记录没有 sentAt，回退 record.startTime（原行为）。
 *   状态码与耗时按语义分级着色（2xx/3xx/4xx 与 200ms/500ms 阈值），颜色由 CSS 类控制。
 *
 * 协作：RequestDetail 内渲染；格式化与分级复用 utils/formatters。
 */
import type { RequestRecord } from '@request-monitor/shared';
import { durationTone, formatDuration, formatTime, statusTone } from '../utils/formatters';

interface GeneralTabProps {
  record: RequestRecord;
}

export default function GeneralTab({ record }: GeneralTabProps) {
  const items: { label: string; value: string; className?: string }[] = [
    { label: 'URL', value: record.url, className: 'mono' },
    { label: 'Method', value: record.method },
    { label: 'Status', value: String(record.responseStatus || 'No response'), className: `value-${statusTone(record.responseStatus)}` },
    { label: 'Duration', value: formatDuration(record.duration), className: `value-${durationTone(record.duration)}` },
    // 实时抓包的 startTime 是 performance.now()（格式化会显示 1970），优先用 epoch ms 的 sentAt
    { label: 'Start Time', value: formatTime(record.sentAt ?? record.startTime), className: 'mono' },
    { label: 'Type', value: record.type === 'fetch' ? 'fetch()' : record.type === 'xhr' ? 'XMLHttpRequest' : 'HAR import' },
  ];

  return (
    <table className="kv">
      <tbody>
        {items.map(({ label, value, className }) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td className={className}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
