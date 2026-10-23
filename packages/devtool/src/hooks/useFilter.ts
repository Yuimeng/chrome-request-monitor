/**
 * 模块：devtool / hooks / useFilter —— 展示层过滤 Hook
 *
 * 组成：filters 状态（url/method/status/type 四维）+ filteredRequests 的 useMemo 派生结果。
 *   - statusFilter 按状态码首字符分组匹配（'2xx' 匹配所有 2 开头状态码）
 * 协作：Toolbar 修改 filters → 本 Hook 过滤 → RequestTable/StatusBar 展示结果；
 *   注意这与 content 侧 CaptureFilter 不同：那是"抓取过滤"，这是"展示过滤"。
 */
import { useMemo, useState } from 'react';
import type { RequestRecord } from '@request-monitor/shared';
import type { FilterConfig } from '@request-monitor/shared';

export function useFilter(requests: RequestRecord[]) {
  const [filters, setFilters] = useState<FilterConfig>({
    urlFilter: '',
    methodFilter: '',
    statusFilter: '',
    typeFilter: '',
  });

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
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
  }, [requests, filters]);

  return { filteredRequests, filters, setFilters };
}
