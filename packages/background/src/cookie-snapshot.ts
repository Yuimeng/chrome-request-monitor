/**
 * 模块：background / cookie-snapshot —— 抓包记录的 Cookie 快照补全（方案 A）
 *
 * 组成：
 *   - getCookieHeaderSnapshot  按请求 URL 从浏览器 cookie store 读取 Cookie，拼成请求头值；
 *     结果按 URL 缓存 30s（含"无 cookie"的负缓存），并带超时保护，避免拖住抓包入列
 *   - enrichRecordsWithCookieSnapshot  就地补全一批 RequestRecord：写 requestCookie / cookieSource='snapshot'
 *
 * 协作：
 *   - 由 background 的消息路由在记录入列前调用（content 侧读不到浏览器注入的 Cookie，
 *     只能由扩展进程侧补；详见 docs/cookie-capture.md）
 *   - 只做"近似值"：chrome.cookies 不感知 SameSite / 第三方拦截 / CHIPS / credentials，
 *     这些误差由 UI 按 cookieSource 标注；页面侧 cookiesSent=false 的记录直接跳过
 *   - 补全失败只影响该条记录的 Cookie 字段，不影响记录本身入列与上报
 */
import type { RequestRecord } from '@request-monitor/shared';

/** 同一 URL 的快照缓存时长；SW 休眠后 Map 丢失，重新读取即可 */
const CACHE_TTL_MS = 30_000;
/** 单条 Cookie 头上限，防止个别站点把 storage.session 撑爆 */
const MAX_COOKIE_HEADER = 8 * 1024;
/** 缓存条目上限，超过直接清空（简单防膨胀） */
const MAX_CACHE_ENTRIES = 500;
/** 单次 chrome.cookies.getAll 超时；正常是毫秒级，超时按"无值"降级，避免卡住入列队列 */
const LOOKUP_TIMEOUT_MS = 1_000;

const cache = new Map<string, { value?: string; exp: number }>();

/**
 * 读取 url 对应的 Cookie 请求头（近似值）。
 *
 * 关键点：chrome.cookies.getAll({ url }) 的返回顺序官方保证为
 * "path 长者在前；同一 path 长度按创建时间早者在前"，等价 RFC 6265 §5.4 的发送顺序，
 * 因此直接按返回顺序拼接即可——不要按 name 去重（同名不同 path 的 cookie 会一起发送），
 * 也不要重排（API 不暴露 creationDate，重排后无法还原真实顺序）。
 */
export async function getCookieHeaderSnapshot(url: string): Promise<string | undefined> {
  if (!/^https?:/i.test(url)) return undefined;
  if (!chrome.cookies?.getAll) return undefined;

  const now = Date.now();
  const cached = cache.get(url);
  if (cached && cached.exp > now) return cached.value;

  let value: string | undefined;
  try {
    const cookies = await withTimeout(chrome.cookies.getAll({ url }), LOOKUP_TIMEOUT_MS);
    if (cookies && cookies.length > 0) {
      const header = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
      value = header.length > MAX_COOKIE_HEADER ? truncateCookieHeader(header) : header;
    }
  } catch {
    // URL 非法 / 无 host 权限 / cookie store 不可用：静默降级为 undefined
    value = undefined;
  }

  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(url, { value, exp: now + CACHE_TTL_MS });
  return value;
}

/**
 * 就地补全一批记录：缺失 Cookie 且页面侧没有判定"不带"的记录会写入快照值。
 * 不抛错；单条失败只影响该条。
 */
export async function enrichRecordsWithCookieSnapshot(records: RequestRecord[]): Promise<void> {
  const pendingByUrl = new Map<string, Promise<string | undefined>>();

  await Promise.all(
    records.map(async (record) => {
      if (record.requestCookie) return;          // 已有值（HAR 导入 / webRequest 权威值）
      if (record.cookieObserved) return;         // 方案 B 已给出权威结论（含"确实没带"）
      if (record.cookiesSent === false) return;  // 页面侧判定：本次请求不带 Cookie
      if (!/^https?:/i.test(record.url)) return;

      let pending = pendingByUrl.get(record.url);
      if (!pending) {
        pending = getCookieHeaderSnapshot(record.url);
        pendingByUrl.set(record.url, pending);
      }

      const cookie = await pending;
      if (cookie) {
        record.requestCookie = cookie;
        record.cookieSource = 'snapshot';
      }
    }),
  );
}

/** 超长 Cookie 头按最后一个完整 cookie 截断，避免留下半截 name=value */
function truncateCookieHeader(header: string): string {
  const cut = header.lastIndexOf('; ', MAX_COOKIE_HEADER);
  return cut > 0 ? header.slice(0, cut) : header.slice(0, MAX_COOKIE_HEADER);
}

/** Promise 超时包装：超时/失败都解析为 undefined，保证补全流程一定能往前走 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}
