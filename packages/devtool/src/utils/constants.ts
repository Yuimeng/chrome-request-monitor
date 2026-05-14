export const FILTER_OPTIONS = {
  method: ['', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
  status: ['', '2xx', '3xx', '4xx', '5xx'],
  type: ['', 'fetch', 'xhr', 'har'],
} as const;

export const LABELS: Record<string, string> = {
  '': 'All',
  'GET': 'GET',
  'POST': 'POST',
  'PUT': 'PUT',
  'DELETE': 'DELETE',
  'PATCH': 'PATCH',
  'HEAD': 'HEAD',
  '2xx': '2xx',
  '3xx': '3xx',
  '4xx': '4xx',
  '5xx': '5xx',
  'fetch': 'fetch',
  'xhr': 'xhr',
  'har': 'HAR',
};
