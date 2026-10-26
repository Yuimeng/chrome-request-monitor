/**
 * 模块：devtool / utils / cookies —— 请求 cookie 的读取与传递
 *
 * 组成：
 *   - findCookieHeader     从抓包记录的请求头里取 Cookie（HAR 导入常见，实时抓包没有）
 *   - readCookieFromStore  按 URL 从浏览器 cookie store 读取（chrome.cookies，需 cookies 权限）
 *   - resolveCookieString  优先传入的 Cookie 头（抓包头或记录快照），缺失时回退 cookie store
 *
 * 协作：BodyTab 解密前取登录态；HeadersTab 在请求头表格中补展示 Cookie；
 *   RequestDetail 负责把抓包头 / 记录快照（requestCookie）与 URL 透传给两者。
 */
export function findCookieHeader(headers?: [string, string][]): string | undefined {
  return headers?.find(([name]) => name.toLowerCase() === "cookie")?.[1] || undefined;
}

/**
 * 读取 url 对应的 cookie 字符串（name=value; name2=value2）。
 * 浏览器自动附加的 Cookie 头在 JS 侧不可见，实时抓包只能按 URL 回查。
 *
 * 注意：chrome.cookies.getAll({ url }) 的返回顺序官方保证为“path 长者在前、
 * 同一 path 长度按创建时间早者在前”，等价 RFC 6265 §5.4 的发送顺序，因此这里
 * 直接按返回顺序拼接——不按 name 去重（同名不同 path 的 cookie 会一起发送），
 * 也不重排（API 不暴露 creationDate，重排后无法还原真实顺序）。
 */
export async function readCookieFromStore(
  url?: string,
): Promise<string | undefined> {
  if (!url || !chrome.cookies?.getAll) return undefined;
  try {
    const cookies = await chrome.cookies.getAll({ url });
    if (cookies.length === 0) return undefined;
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } catch {
    // URL 非法或没有 cookies 权限：静默降级，不影响展示与解密
    return undefined;
  }
}

/**
 * 取得可用作解密登录态的 Cookie 字符串：
 * 优先调用方传入的值（HAR 抓包头 / 实时抓包的 requestCookie 快照），
 * 都没有时才回退到按 URL 实时读取 cookie store。
 */
export async function resolveCookieString(
  header: string | undefined,
  url: string | undefined,
): Promise<string | undefined> {
  return header || (await readCookieFromStore(url));
}
