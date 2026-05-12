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
