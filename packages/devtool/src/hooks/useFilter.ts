/**
 * 模块：devtool / hooks / useFilter —— 展示层过滤 + 排序 Hook
 *
 * 组成：
 *   - filters 状态（url/method/status/type 四维）
 *   - sort 状态（字段 + 方向），默认按时间正序（与抓取到达顺序一致）
 *   - filteredRequests 的 useMemo 派生结果：先过滤再排序，均不改动原始数组
 *
 * 说明：
 *   - statusFilter 按状态码首字符分组匹配（'2xx' 匹配所有 2 开头状态码）
 *   - 排序只影响展示，不影响 background 的缓冲与淘汰（淘汰始终按时间）
 *   - 时间取值与 background 一致：优先 sentAt，HAR 导入用 epoch 级 startTime，
 *     performance.now() 相对值无法跨页比较，按 0 处理
 *
 * 协作：Toolbar 修改 filters/sort → 本 Hook 过滤排序 → RequestTable/StatusBar 展示结果；
 *   注意这与 content 侧 CaptureFilter 不同：那是"抓取过滤"，这是"展示过滤"。
 */
import { useMemo, useState } from 'react';
import type { RequestRecord } from '@request-monitor/shared';
import type { FilterConfig } from '@request-monitor/shared';
import type { SortKey } from '../utils/constants';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

export const DEFAULT_SORT: SortState = { key: 'time', direction: 'asc' };

// 排序取值：数字字段返回 number（按大小比较），文本字段返回 string（按字典序）
function sortValue(record: RequestRecord, key: SortKey): number | string {
  switch (key) {
    case 'time':
      return record.sentAt ?? (record.startTime > 1e12 ? record.startTime : 0);
    case 'method':
      return record.method;
    case 'status':
      return record.responseStatus;
    case 'duration':
      return record.duration;
    case 'path':
      return record.url;
  }
}

function compareRecords(a: RequestRecord, b: RequestRecord, key: SortKey): number {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  return String(va).localeCompare(String(vb), 'en');
}

export function useFilter(requests: RequestRecord[]) {
  const [filters, setFilters] = useState<FilterConfig>({
    urlFilter: '',
    methodFilter: '',
    statusFilter: '',
    typeFilter: '',
  });
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const filteredRequests = useMemo(() => {
    const result = requests.filter((req) => {
      if (filters.urlFilter && !req.url.toLowerCase().includes(filters.urlFilter.toLowerCase())) {
        return false;
      }
      if (filters.methodFilter && req.method !== filters.methodFilter) {
        return false;
      }
      if (filters.statusFilter) {
        const statusGroup = filters.statusFilter;
        const prefix = statusGroup[0];
        if (String(req.responseStatus)[0] !== prefix) {
          return false;
        }
      }
      if (filters.typeFilter && req.type !== filters.typeFilter) {
        return false;
      }
      return true;
    });

    // filter 已返回新数组，可原地排序；sort 在 V8 中是稳定排序，同值保持到达顺序
    const factor = sort.direction === 'asc' ? 1 : -1;
    result.sort((a, b) => factor * compareRecords(a, b, sort.key));

    return result;
  }, [requests, filters, sort]);

  return { filteredRequests, filters, setFilters, sort, setSort };
}
