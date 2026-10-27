/**
 * 模块：devtool / utils / cookies —— 解析"当前请求自身携带的 Cookie"
 *
 * 组成：
 *   - findCookieHeader     从请求头数组里取 Cookie（HAR 导入 / 页面显式设置时才有）
 *   - resolveRequestCookie 解析优先级：抓包头 > background 补的 requestCookie 快照
 *
 * 协作：RequestDetail 用 resolveRequestCookie 得到唯一值，同一个值同时传给
 *   HeadersTab 展示与 BodyTab 解密。devtool 不再读取浏览器 cookie store——避免把
 *   请求之外、或请求发生之后才变化/新增的 cookie 混进展示与解密上下文，
 *   保证"面板显示什么、解密就传什么"。
 */
import type { RequestRecord } from '@request-monitor/shared';

export function findCookieHeader(headers?: [string, string][]): string | undefined {
  return headers?.find(([name]) => name.toLowerCase() === "cookie")?.[1] || undefined;
}

/** 当前请求自身携带的 Cookie：抓包头（HAR）/ 页面显式头优先，其次实时抓包的快照值 */
export function resolveRequestCookie(
  record: Pick<RequestRecord, 'requestHeaders' | 'requestCookie'>,
): string | undefined {
  return findCookieHeader(record.requestHeaders) ?? record.requestCookie;
}
