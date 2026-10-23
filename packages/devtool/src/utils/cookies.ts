/**
 * 模块：devtool / utils / cookies —— 请求 cookie 的读取与传递
 *
 * 组成：
 *   - findCookieHeader     从抓包记录的请求头里取 Cookie（HAR 导入常见，实时抓包没有）
 *   - readCookieFromStore  按 URL 从浏览器 cookie store 读取（chrome.cookies，需 cookies 权限）
 *   - resolveCookieString  优先抓包头，缺失时回退 cookie store
 *
 * 协作：BodyTab 解密前取登录态；HeadersTab 在请求头表格中补展示 Cookie；
 *   RequestDetail 负责把抓包头与 URL 透传给两者。
 */
export function findCookieHeader(headers?: [string, string][]): string | undefined {
  return headers?.find(([name]) => name.toLowerCase() === "cookie")?.[1] || undefined;
}

/**
 * 读取 url 对应的 cookie 字符串（name=value; name2=value2）。
 * 浏览器自动附加的 Cookie 头在 JS 侧不可见，实时抓包只能按 URL 回查；
 * 同名 cookie 只保留第一个，避免不同 path 造成的重复。
 */
export async function readCookieFromStore(
  url?: string,
): Promise<string | undefined> {
  if (!url || !chrome.cookies?.getAll) return undefined;
  try {
    const cookies = await chrome.cookies.getAll({ url });
    const byName = new Map<string, string>();
    for (const c of cookies) {
      if (!byName.has(c.name)) byName.set(c.name, c.value);
    }
    if (byName.size === 0) return undefined;
    return Array.from(byName, ([name, value]) => `${name}=${value}`).join("; ");
  } catch {
    // URL 非法或没有 cookies 权限：静默降级，不影响展示与解密
    return undefined;
  }
}

export async function resolveCookieString(
  header: string | undefined,
  url: string | undefined,
): Promise<string | undefined> {
  return header || (await readCookieFromStore(url));
}
