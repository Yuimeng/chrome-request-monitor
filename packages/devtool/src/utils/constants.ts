/**
 * 模块：devtool / utils / constants —— 面板 UI 常量
 *
 * 组成：
 *   - FILTER_OPTIONS  Toolbar 三个下拉框的可选值（method/status 分组/type）
 *   - LABELS          选项值 → 显示文案映射（空串统一显示 "All"，har 显示 "HAR"）
 *
 * 协作：仅被 Toolbar 引用，与 shared/constants 不同层（这是纯 UI 展示配置）。
 */
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
