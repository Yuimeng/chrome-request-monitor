/**
 * 模块：devtool / components / GeneralTab —— 概览标签页
 *
 * 组成：URL/Method/Status/Duration/Start Time/Type 六行键值表。
 * 协作：RequestDetail 内渲染；格式化复用 utils/formatters。
 */
import type { RequestRecord } from '@request-monitor/shared';
import { formatDuration, formatTime } from '../utils/formatters';

interface GeneralTabProps {
  record: RequestRecord;
}

export default function GeneralTab({ record }: GeneralTabProps) {
  const items: [string, string][] = [
    ['URL', record.url],
    ['Method', record.method],
    ['Status', String(record.responseStatus)],
    ['Duration', formatDuration(record.duration)],
    ['Start Time', formatTime(record.startTime)],
    ['Type', record.type === 'fetch' ? 'fetch()' : 'XMLHttpRequest'],
  ];

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
      <tbody>
        {items.map(([key, value]) => (
          <tr key={key} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ width: '140px', padding: '6px 12px', color: '#666', fontWeight: 600, verticalAlign: 'top', whiteSpace: 'nowrap' }}>
              {key}
            </td>
            <td style={{ padding: '6px 12px', color: '#333', wordBreak: 'break-all', fontFamily: key === 'URL' ? 'monospace' : 'inherit' }}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
