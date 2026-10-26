# 从捕获请求中读取 Cookie：MV3 方案设计

> 场景：MV3 扩展在页面主世界（main-world）重写 `fetch` / `XMLHttpRequest` 抓包，
> 现在需要拿到"这条请求实际带上的 Cookie"。
> 本文给出结论、两条可行方案（chrome.cookies 快照 / webRequest 权威读取）、
> 面向本仓库（`packages/*`）的落地清单与验证方式。代码为设计稿，不代表已实现。
>
> **实现状态（2026-10-26）**：**Phase 1（方案 A + A+）已落地**，涉及：
> `packages/background/src/cookie-snapshot.ts`（新增）、`packages/background/src/index.ts`、
> `packages/shared/src/types.ts`、`packages/content/src/main-world.ts`、
> `packages/devtool/src/{utils/cookies.ts, components/HeadersTab.tsx, components/RequestDetail.tsx, components/GeneralTab.tsx}`。
> Phase 2（webRequest）未实现；`cookieSource='webrequest'` / `cookieObserved` 的 UI 与类型分支已预留。
> 构建后加载 `dist/` 即可验证。

---

## 0. 结论速览

| 问题 | 结论 |
|------|------|
| 重写 `fetch`/`XHR` 能直接拿到 Cookie 吗？ | **不能**。`Cookie` 是 Fetch 规范的 forbidden request header，由浏览器在发送时注入；页面 JS 既读不到、也塞不进。`document.cookie` 只覆盖"当前文档 URL 对应的非 HttpOnly cookie"：跨域与 HttpOnly cookie 看不到，其它顶层站点的分区（CHIPS）cookie 也看不到（当前分区内非 HttpOnly 的分区 cookie 仍可见）。 |
| MV3 下正确的读法是什么？ | ① **`chrome.cookies`** 按请求 URL 回查 cookie store（**近似值**，零新增权限，本仓库已具备 `"cookies"` + `<all_urls>`）；② **`chrome.webRequest.onBeforeSendHeaders` + `extraHeaders`**（**权威值**，得到的就是实际发送的头，需 `"webRequest"` 权限，观察型在 MV3 可用）。 |
| 想要"记录里的 Cookie = 线上实际发出的 Cookie"？ | 只有 webRequest。cookies API 无法精确重建（SameSite、第三方 Cookie 拦截、CHIPS、credentials、Set-Cookie 时序都会造成偏差）。 |
| 本仓库推荐路线 | **Phase 1**：background 在收到抓包记录时用 cookies API 补全（顺带修掉现有 UI 懒查的三个缺陷）；**Phase 2**：加 webRequest 采集器作为权威来源，cookies API 降级为兜底。用 `cookieSource` 字段区分来源并在 UI 标注。 |
| 为什么不用 declarativeNetRequest / chrome.debugger | DNR 设计上不允许读取请求头内容；debugger 在本项目**不可行**——打开 DevTools 会 detach（本扩展本身就是 DevTools 面板扩展）。 |

---

## 1. 为什么重写 fetch / XHR 拿不到 Cookie

### 1.1 Cookie 是 UA 独占的 forbidden request header

- Fetch 规范把 `Cookie`（以及 `Set-Cookie`、`Host`、`Origin` 等）列为 **forbidden request-header**，
  理由原文是 *"These are forbidden so the user agent remains in full control over them."*
  Chrome 会丢弃页面通过 `fetch(url, { headers: { Cookie: ... } })` 或
  `xhr.setRequestHeader('Cookie', ...)` 设置的该头，同时也不会把浏览器注入的 Cookie 暴露给页面。
- Cookie 头由浏览器在发送前根据"请求上下文 + cookie store"自行计算并注入
  （Fetch 规范 §"append a request Cookie header"：先定 sameSite / isSecure，再 retrieve cookies）。
  因此页面侧 hook 能看到的只有**页面显式设置的请求头**（如 `Authorization`），Cookie 必然缺席。
- 现有 `packages/content/src/main-world.ts` 只记录 `init.headers` / `setRequestHeader` 收到的头，
  拿不到 Cookie 是规范决定的，不是 hook 写法的问题。

### 1.2 `document.cookie` 也不能兜底

- HTML 规范：`document.cookie` 表示 *"the cookies of the resource identified by the document's URL"*，
  用的是 document URL + "non-HTTP API" 的 cookie-string。
- 因此它：
  - 拿不到 **HttpOnly** cookie（HttpOnly 的本意就是"非 HTTP API 不可见"）；
  - 拿不到**跨域请求**目标站点的 cookie（那是另一个 host 的 cookie）；
  - 拿不到 **Partitioned（CHIPS）** cookie 的完整视图：只能看到当前分区内非 HttpOnly 的分区 cookie，
    看不到其它顶层站点分区下的 cookie，也不反映 SameSite 带来的发送限制。
- 结论：`document.cookie` 只能验证"当前页面同源"的局部信息，不能作为请求 Cookie 来源。

### 1.3 页面侧唯一还能贡献的信息："这次请求本来该不该带 Cookie"

虽然读不到值，但页面侧可以判断**发送语义**，这对减少方案 A 的误报非常关键：

| 发送方式 | 是否带 Cookie 的规则 |
|---|---|
| `fetch(url, { credentials })` | 默认 `same-origin`：仅同源带；`omit`：一定不带；`include`：跨域也带（仍受 SameSite / 第三方拦截约束） |
| `XMLHttpRequest` | `withCredentials` 默认 `false`；跨域且未显式置 `true` 时不带；同源总是带 |
| 附加限制 | SameSite=Lax/Strict、第三方 Cookie 被拦截、CHIPS 分区键，都会让"cookie store 里有"≠"这次会发送" |

**小结**：Cookie 必须由**扩展进程侧**（background / devtool 面板）补，页面侧只能提供
`credentials` / `withCredentials` / 是否同源 这类上下文。

---

## 2. 方案 A：`chrome.cookies` 快照（近似值，零新增权限）

### 2.1 为什么落点在 background

| 上下文 | 能否用 `chrome.cookies` | 说明 |
|---|---|---|
| main-world（页面世界） | ❌ | 没有任何 `chrome.*` |
| isolated-world（content script） | ❌ | 官方限制：content script 只能直接用 `dom / i18n / storage / runtime` 等少数 API，`cookies` 不在其中，必须经 background 中转 |
| background SW | ✅ | 有 `"cookies"` 权限 + `<all_urls>` host 权限即可 |
| devtool 面板 | ✅ | 但只在面板打开时存在，且读取时刻比请求时刻更晚 |

本仓库现在是"devtool 面板里点开详情时才懒查"（`packages/devtool/src/utils/cookies.ts`），
面板没开 / 没点开详情 / 导出 / 解密链路都拿不到 Cookie。把它提前到 **background 收到记录时**，
能让 `requestBuffer`、Port 广播、`storage.session` 持久化、解密、未来的 HAR 导出一次性受益，
且**不需要新增消息类型**（记录入列前就补好，下游拿到的就是补全后的记录）。

### 2.2 数据契约（`packages/shared/src/types.ts`）

只加可选字段，不改 `Message` 联合类型，旧记录 / HAR 导入记录天然兼容（缺字段 = `undefined`）：

```ts
export interface RequestRecord {
  // ...现有字段保持不变
  /** Cookie 请求头值（HAR 导入时可能已在 requestHeaders 里，另见 cookieSource） */
  requestCookie?: string;
  /** 该 Cookie 值的来源，用于 UI 标注可信度 */
  cookieSource?: 'header' | 'snapshot' | 'webrequest';
  /** 方案 B：webRequest 已观察到该请求（此时 requestCookie 缺失 = 权威的"确实没带"，不要再快照兜底） */
  cookieObserved?: boolean;
  /** 方案 A+：页面侧判定的发送语义，false 表示这次请求本就不该带 Cookie */
  cookiesSent?: boolean;
  /** 方案 B：实际发起请求的时刻（epoch ms），同时可用于修 Start Time 显示 */
  sentAt?: number;
}
```

### 2.3 background 补全实现

新建 `packages/background/src/cookie-snapshot.ts`：

```ts
import type { RequestRecord } from '@request-monitor/shared';

const CACHE_TTL_MS = 30_000;          // 同一 URL 的 cookie 快照缓存 30s，避免每条记录一次 IPC
const MAX_COOKIE_HEADER = 8 * 1024;   // 防御性截断，避免个别站点把 storage.session 撑爆

const cache = new Map<string, { value?: string; exp: number }>();

/**
 * 按 URL 从 cookie store 读 Cookie 头（近似值）。
 *
 * 关键点：
 * 1) chrome.cookies.getAll({ url }) 的返回顺序官方保证为
 *    "path 长者在前；同 path 长度按创建时间早者在前" —— 正好等价 RFC 6265 §5.4 的发送顺序，
 *    所以**直接按返回顺序拼接**，不要再按 name 去重、也不要重排（API 不暴露 creationDate，重排就回不去了）。
 * 2) getAll 只做 domain/path/secure 匹配；SameSite、第三方拦截、credentials 它都不感知。
 * 3) 默认只返回**未分区** cookie；CHIPS 需要显式 partitionKey（见 §2.5）。
 */
export async function getCookieHeaderSnapshot(url: string): Promise<string | undefined> {
  if (!/^https?:/i.test(url)) return undefined;

  const now = Date.now();
  const hit = cache.get(url);
  if (hit && hit.exp > now) return hit.value;

  let value: string | undefined;
  try {
    const cookies = await chrome.cookies.getAll({ url });
    if (cookies.length > 0) {
      value = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      if (value.length > MAX_COOKIE_HEADER) value = value.slice(0, MAX_COOKIE_HEADER);
    }
  } catch {
    // URL 非法 / 无 host 权限 / cookie store 不可用：静默降级，不影响抓包
    value = undefined;
  }

  if (cache.size > 500) cache.clear();
  cache.set(url, { value, exp: now + CACHE_TTL_MS });
  return value;
}

/** 就地补全一批记录；补全失败不影响记录入列 */
export async function enrichRecordsWithCookieSnapshot(records: RequestRecord[]): Promise<void> {
  const byUrl = new Map<string, Promise<string | undefined>>();

  await Promise.all(
    records.map(async (record) => {
      if (record.requestCookie) return;        // 已有真实头（HAR 导入 / webRequest 命中）
      if (record.cookieObserved) return;       // 方案 B 已给出权威结论（含"确实没带"）
      if (record.cookiesSent === false) return; // A+：页面侧已判定"本就不带"
      if (!/^https?:/i.test(record.url)) return;

      let pending = byUrl.get(record.url);
      if (!pending) {
        pending = getCookieHeaderSnapshot(record.url);
        byUrl.set(record.url, pending);
      }
      const cookie = await pending;
      if (cookie) {
        record.requestCookie = cookie;
        record.cookieSource = 'snapshot';
      }
    }),
  );
}
```

接入 `packages/background/src/index.ts` 的消息路由（`REQUESTS_BATCH` / `REQUEST_CAPTURED`）：

```ts
case MESSAGE_TYPES.REQUESTS_BATCH: {
  const records = message.data as RequestRecord[];
  enrichRecordsWithCookieSnapshot(records)
    .then(() => {
      for (const record of records) {
        requestBuffer.push(record);
        broadcastToDevTools(record);
      }
      persistBuffer();
      sendResponse({ ok: true });   // content 的 flushBuffer 依赖 ok 才清空缓冲
    })
    .catch(() => {
      // 补全异常也必须落库并回 ok，避免 content 侧重试风暴
      for (const record of records) {
        requestBuffer.push(record);
        broadcastToDevTools(record);
      }
      persistBuffer();
      sendResponse({ ok: true });
    });
  return true;   // 保持异步 sendResponse 通道
}
```

注意：

- `IMPORT_REQUESTS`（HAR 导入）**不要补全**——导入的是历史记录，按 URL 回查会伪造 Cookie；
- `persistBuffer()` 的单条记录体积会变大（Cookie 典型 200B–2KB，按 8KB 截断上限估算，500 条最多约 4MB）；
  Cookie 自身增量可控，但**现有 body 可能早已让持久化失效**（见 §5.3），这不是本需求引入、也不由本需求解决；
- 缓存 key 用**完整 URL**（path 影响 cookie 集合），TTL 30s；SW 休眠后 Map 丢失，重新读取即可。

### 2.4 展示 / 解密链路复用（devtool 最小 diff）

1. `packages/devtool/src/utils/cookies.ts`：修掉"按 name 去重"的缺陷——浏览器对同名不同 path 的
   cookie 是**都会发送**的，去重既丢数据又破坏 `getAll` 已排好的顺序：

```ts
export async function readCookieFromStore(url?: string): Promise<string | undefined> {
  if (!url || !chrome.cookies?.getAll) return undefined;
  try {
    const cookies = await chrome.cookies.getAll({ url });
    if (cookies.length === 0) return undefined;
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  } catch {
    return undefined;
  }
}
```

2. `RequestDetail.tsx`：优先用记录里的快照（HAR 导入时 `findCookieHeader` 已有值，天然优先）：

```ts
const cookieHeader = findCookieHeader(record.requestHeaders) ?? record.requestCookie;
```

  这一行同时让 `BodyTab` 的解密逻辑自动复用快照（它调用
  `resolveCookieString(cookieHeader, requestUrl)`，有值就不再实时回查 store），
  解密不再依赖"用户点解密那一刻"的 cookie 状态。

   > 顺序正确 ≠ 就是真实发送值：这里拿到的仍是 §2.5 的近似快照，UI 必须按 `cookieSource` 标注来源。

3. `HeadersTab`：请求头里没有 Cookie 时，优先展示 `record.requestCookie` 并标注来源
   （`snapshot` → "from cookie snapshot"，`webrequest` → "from webRequest"）；
   若 `cookieObserved === true` 且没有值，显示"no Cookie sent (from webRequest)"这一权威结论；
   只有记录里完全没有时才回退现有的 store 懒查，保留旧记录的可用性。
   新增的 `snapshotCookie` / 来源 props 要**设为可选**——同一组件还用于 Response Headers
   （`RequestDetail.tsx` 第二处调用只传 `headers` / `title`）。

### 2.5 精度边界（必须写进 UI 与文档，别当成真实发送值）

| 偏差 | 方向 | 原因 / 能否规避 |
|---|---|---|
| 登录等 `Set-Cookie` 请求 | **误报** | 记录在**响应完成后**才产生，此时新 session cookie 已写入 store → 会把"响应才产生的 cookie"补到"没带 Cookie 的登录请求"上。A+ 的 `cookiesSent` 救不了（同源登录本来就会带/可带）。 |
| `credentials: 'omit'` / 跨域默认 `same-origin` / XHR `withCredentials=false` | 误报 | A+ 可在页面侧判定并跳过，但需改 `main-world.ts`（见 §2.6）。 |
| SameSite=Lax/Strict 跨站子资源 | 误报 | cookies API 不感知请求上下文；页面侧无法可靠判断（需要顶层站点 + 导航语义）。 |
| 第三方 Cookie 被拦截 | 误报 | RFC 6265 允许 UA 整体省略 Cookie 头；`getAll` 仍从 store 返回。 |
| CHIPS / Partitioned cookie | 漏报 | 所有 cookies API 默认只操作未分区 cookie；需要 `partitionKey`（Chrome 119+），而 frame 的 partition key 要用 `chrome.cookies.getPartitionKey`（Chrome 132+）。webRequest 天然正确。 |
| 请求时刻与读取时刻错位 | 误报/漏报 | 缓存 30s + 收到记录时读取，窗口内 cookie 变更（登录、登出、SSO 刷新）会失真。 |
| Secure cookie / HttpOnly cookie | 一致 | `getAll({ url })` 会按 scheme 过滤 Secure；HttpOnly 扩展可读，与真实发送一致。 |

一句话：**方案 A 适合"展示 / 解密取登录态 / 参考"，不适合"重放、签名校验、审计"**。

> 依据说明：表中 "SameSite / 第三方拦截不感知" 来自 Chromium 实现（`cookies_helpers.cc` 使用
> `net::CookieOptions::MakeAllInclusive()`，SameSite 上下文取最宽松的 strict），官方 cookies
> 文档未逐条声明；"Secure 按 scheme 过滤、HttpOnly 可读" 同源于此。

### 2.6 A+ 降误报（约 15 行，建议一起做）

在 `packages/content/src/main-world.ts` 记录发送语义，background 据此跳过明显不会带 Cookie 的请求：

```ts
// fetch hook 内：init 优先，否则看 Request 对象；默认 same-origin
const credentials =
  init?.credentials ??
  (typeof input === 'object' && 'credentials' in input ? input.credentials : 'same-origin');
const absoluteUrl = new URL(requestUrl, document.baseURI).href;
const sameOrigin = new URL(absoluteUrl).origin === location.origin;
const cookiesSent =
  credentials === 'include' || (credentials === 'same-origin' && sameOrigin);

// XHR hook 内：同源总是带；跨域看 withCredentials（默认 false）
const cookiesSentXhr =
  new URL(requestUrl, document.baseURI).origin === location.origin || xhr.withCredentials;
```

把 `cookiesSent` 放进 `RequestRecord`，`enrichRecordsWithCookieSnapshot` 里 `cookiesSent === false` 直接跳过。

> 进阶（可选）：在 `fetch` 调用**前**先派发一个"请求开始"事件，让 background 立刻取一次快照，
> 可以把"登录请求误补新 cookie"的窗口从"响应返回后"缩到"请求发出前"，但会多一次异步往返，
> 且仍无法解决 SameSite / 第三方拦截问题。只有 webRequest 能根治。

---

## 3. 方案 B：`webRequest` 权威读取（MV3，观察型）

### 3.1 能力边界（先确认成立性）

| 能力 | MV3 下是否可用 | 依据 |
|---|---|---|
| 观察型 `chrome.webRequest`（`onBeforeSendHeaders` 等） | ✅ 可用 | 官方 webRequest 文档：*"Aside from `webRequestBlocking`, the webRequest API is unchanged and available for normal use."* |
| `webRequestBlocking`（阻止/修改请求） | ❌ 普通扩展不可用，仅策略强制安装（policy / force-installed）扩展可用 | 同页 Permissions 节；MV3 迁移文档亦同。本需求只需观察，**不需要**该权限。 |
| 读取 `Cookie` 请求头 | ✅ 但**必须** `extraInfoSpec` 含 `"extraHeaders"` | Chrome 72 起 Cookie / Referer / Accept-Language / Accept-Encoding 只有带 `extraHeaders` 才可见。 |
| host 权限 | 目标 URL 与 initiator **双边**需有权限 | `<all_urls>` 已满足。 |
| 事件唤醒休眠 SW | ✅ 会唤醒（官方：事件可唤醒休眠 SW；Chrome 110+ 起事件还会重置 30s 空闲计时器） | 但官方**不承诺**零丢失/低延迟；监听器必须**顶层同步注册**，否则冷启动窗口内的事件直接丢。 |
| 修改请求头 | ❌ 观察型只能读 | 本需求不需要修改。 |

已知风险：SW 冷启动窗口内的请求可能漏采（Chromium 有"inactive listener"机制，
停止的 SW 会被 webRequest 事件唤醒，但"监听器注册晚于事件派发"就会丢）；
**Blink 内存缓存**直接命中（未产生网络请求）时不会触发 webRequest（语义正确），
而磁盘 HTTP 缓存命中仍会触发事件（可用 `details.fromCache` 区分）。

### 3.2 manifest 改动

```diff
   "permissions": [
     "storage",
     "scripting",
     "activeTab",
-    "cookies"
+    "cookies",
+    "webRequest"
   ],
```

- **不要**加 `"webRequestBlocking"`：MV3 下该权限仅策略/强制安装扩展可用，普通扩展声明后不会生效
  （`'blocking'` 监听器也注册不上），本需求只需要观察，用不上。
- `host_permissions: ["<all_urls>"]` 保持不动即可满足"目标 + initiator 双边"要求。
- 安装提示：站点访问风险提示来自现有的 `<all_urls>`，加 `webRequest` 预期不新增额外的权限文案；
  不同 Chrome 版本 / 商店的提示措辞可能变化，**以实际安装弹窗为准**。注意
  Chrome Web Store 对 `webRequest` 的审核与用途说明会更敏感。

### 3.3 采集器（background，必须顶层同步注册）

新建 `packages/background/src/webrequest-cookie.ts`：

```ts
import type { RequestRecord } from '@request-monitor/shared';

interface PendingCookieEntry {
  at: number;         // 收到事件时的墙钟（不要用 details.timeStamp 和 Date.now() 直接比较）
  /** 可能为空：webRequest 观察到的请求确实没带 Cookie，也要占位，不能直接丢弃 */
  cookie?: string;
}

const PENDING_TTL_MS = 5_000;
const PENDING_MAX_KEYS = 500;

/** key: tabId:frameId:METHOD:归一化 URL */
const pending = new Map<string, PendingCookieEntry[]>();

// @types/chrome 0.0.300 把 extraInfoSpec 声明为 string[]，拼错也不会报错 → 自己收窄
type RequestHeaderExtraInfo = 'requestHeaders' | 'blocking' | 'extraHeaders';
const EXTRA_INFO_SPEC: RequestHeaderExtraInfo[] = ['requestHeaders', 'extraHeaders'];

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return raw;
  }
}

function keyOf(tabId: number, frameId: number, method: string, url: string): string {
  return `${tabId}:${frameId}:${method}:${normalizeUrl(url)}`;
}

function prunePending(now: number): void {
  for (const [key, entries] of pending) {
    const alive = entries.filter((e) => now - e.at <= PENDING_TTL_MS);
    if (alive.length === 0) pending.delete(key);
    else pending.set(key, alive);
  }
  while (pending.size > PENDING_MAX_KEYS) {
    const oldest = pending.keys().next().value;
    if (oldest === undefined) break;
    pending.delete(oldest);
  }
}

/**
 * 顶层同步调用（模块作用域），不要在 onInstalled / await 之后注册。
 * 观察型 handler 同步返回即可，不需要返回值。
 */
export function registerWebRequestCookieCollector(): void {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      // 只关心页面 tab 里的 fetch/XHR；排除扩展自身（decrypt 代理等）与无 tab 请求
      if (details.tabId < 0) return;
      if (details.type !== 'xmlhttprequest') return;
      if (details.initiator?.startsWith('chrome-extension://')) return;

      const cookie = details.requestHeaders?.find(
        (h) => h.name.toLowerCase() === 'cookie',
      )?.value;

      const now = Date.now();
      if (pending.size > PENDING_MAX_KEYS / 2) prunePending(now);

      const key = keyOf(details.tabId, details.frameId, details.method, details.url);
      const entries = pending.get(key) ?? [];
      // 没带 Cookie 也要入队：这是"权威的空"，用来阻止方案 A 用快照误补
      entries.push({ at: now, cookie });
      pending.set(key, entries);
    },
    { urls: ['<all_urls>'], types: ['xmlhttprequest'] },
    EXTRA_INFO_SPEC,   // 少了 extraHeaders 就永远看不到 Cookie
  );
}

/**
 * 记录到达时调用，一次性消费匹配到的 webRequest 事件。
 * 返回值用于区分三种状态，避免"没观察到"和"确实没带"混为一谈：
 * - 'cookie'    命中，且这次请求带了 Cookie（权威值）
 * - 'no-cookie' 命中，但这次请求确实没带 Cookie（权威的"空"）
 * - 'miss'      webRequest 没观察到（SW 冷启动漏事件 / 时间窗没对上）
 */
export type WebRequestCookieMatch = 'cookie' | 'no-cookie' | 'miss';

export function attachWebRequestCookie(
  record: RequestRecord,
  tabId: number | undefined,
  frameId: number,
): WebRequestCookieMatch {
  if (record.requestCookie || tabId == null) return 'miss';

  const key = keyOf(tabId, frameId, record.method, record.url);
  const entries = pending.get(key);
  if (!entries?.length) return 'miss';

  const approx = record.sentAt ?? Date.now() - (record.duration || 0);
  const windowMs = record.sentAt ? 300 : 1_200;   // 有 sentAt 时窗口可收紧

  let best = -1;
  entries.forEach((entry, i) => {
    const distance = Math.abs(entry.at - approx);
    if (distance <= windowMs && (best < 0 || distance < Math.abs(entries[best].at - approx))) {
      best = i;
    }
  });
  if (best < 0) return 'miss';

  const [hit] = entries.splice(best, 1);           // 一次性消费，防止复用
  if (entries.length === 0) pending.delete(key);

  record.cookieSource = 'webrequest';
  if (hit.cookie) {
    record.requestCookie = hit.cookie;
    return 'cookie';
  }
  // 权威的"没带"：打标后不再让方案 A 的快照兜底，
  // 否则登录请求（响应后才产生 session cookie）等场景会被补上错误的值
  record.cookieObserved = true;
  return 'no-cookie';
}
```

在 `packages/background/src/index.ts` 顶层（import 之后、任何 `await` 之前）注册：

```ts
import { registerWebRequestCookieCollector, attachWebRequestCookie } from './webrequest-cookie';

registerWebRequestCookieCollector();   // 必须在模块顶层同步执行
```

记录到达时先关联、再走方案 A 兜底。**关键：只对 B 没观察到的记录兜底**，
B 已给出"没带 Cookie"的结论时不再兜底（否则 A+B 的语义会互相打架）：

```ts
case MESSAGE_TYPES.REQUESTS_BATCH: {
  const records = message.data as RequestRecord[];
  const tabId = sender.tab?.id;
  const frameId = sender.frameId ?? 0;

  for (const record of records) attachWebRequestCookie(record, tabId, frameId);

  // cookieObserved=true：webRequest 已给出权威结论（含"确实没带"），跳过 A 的快照兜底
  const needFallback = records.filter((r) => !r.cookieObserved);

  enrichRecordsWithCookieSnapshot(needFallback)
    .then(() => { /* push / broadcast / persist / sendResponse({ ok: true }) */ })
    .catch(() => { /* 原样落库 + sendResponse({ ok: true }) */ });
  return true;
}
```

> 当前 `background/src/index.ts` 的 `onMessage` 第二个参数名是 `_sender`（未使用），
> 方案 B 需要改成 `sender` 并读取 `sender.tab?.id` / `sender.frameId`。
> `REQUEST_CAPTURED` 分支目前没有 `sendResponse`，补全后保持 `break` 即可，不要顺手 `return true`
> （否则响应通道一直挂着）。

> **为什么要记"权威的空"**：如果监听器对"没带 Cookie 的请求"直接 `return`，A+B 下就无法区分
> "webRequest 没观察到（SW 漏事件）"和"观察到了、确实没带"。前者应该让 A 的快照兜底，
> 后者绝不能兜底（登录、`credentials: 'omit'`、跨域默认请求会被补上错误的值）。
> 所以 listener 对每个匹配的请求都要入队（`cookie` 可空），命中后由 `cookieObserved` 标记"已观察"。

### 3.4 关联策略：requestId 页面侧不可见，只能按"tab + frame + 方法 + URL + 时间窗"

- `requestId` 在扩展侧事件链（`onBeforeRequest → onBeforeSendHeaders → ...`）内稳定，
  但**页面侧拿不到**，它不能作为主键；
- 页面记录到达 background 时，可用的对齐信息：`sender.tab.id`、`sender.frameId`
  （Chrome 106+ 还有 `sender.documentId`）、`record.method`、`record.url`、`record.sentAt`；
- 因此关联键取 `(tabId, frameId, method, 归一化 URL)` + 时间窗，命中后**一次性消费**；
- 冲突概率：同一 frame 对**同一 URL 的并发/高频重复请求**才会错配（GET 轮询、埋点上报）。
  收紧手段：`sentAt`（main-world 在 fetch 调用 / xhr.send 时记 `Date.now()`）+ 300ms 窗口；
  仍不够时再加 `onBeforeRequest` 建 requestId 时间线、或按 `responseStatus`/请求体摘要二次校验；
- 更精确的 `documentId`（Chrome 106+）：content 侧 `sender.documentId` 与 webRequest 事件
  `details.documentId` 对齐，能把"frame 复用"造成的歧义再降一层，但需要 `minimum_chrome_version` 兜底判断。
  注意 `@types/chrome` 0.0.300 把 `details.documentId` 声明成**必填**（运行时 Chrome <106 并不提供），
  实际使用要 `details.documentId && sender.documentId` 双重判断。

### 3.5 页面侧需要补的两个字段（与方案 A 共用）

1. **URL 归一化**：main-world 现在把 `fetch('/api/x')` 的原样字符串存进 `record.url`，
   `chrome.cookies.getAll({ url })` 与 webRequest 关联都要求绝对 URL。
   在 `main-world.ts` 里统一 `new URL(input, document.baseURI).href`
   （用 `document.baseURI` 而不是 `location.href`：页面有 `<base href>` 时解析基准不同）。
   注意这是**行为变化**：现有 `CaptureFilter.urlPattern` 匹配的是原始字符串，绝对化后 origin 也会进入匹配范围。
2. **`sentAt`**：`record.startTime` 现在是页面内 `performance.now()` 相对值
   （`GeneralTab` 用 `new Date()` 格式化会显示成 1970），webRequest 归一化又需要墙钟时间。
   在 fetch 调用处 / **`xhr.send` 处**补 `sentAt: Date.now()`（XHR 的 `startTime` 取在构造函数里，
   与实际发送时刻可能差很远），同时可用它修正 Start Time 显示。

### 3.6 快速自检（加载扩展后在 background SW 的 Console 里跑）

```js
// 前提：manifest 已加 "webRequest" 权限并重新加载扩展
chrome.webRequest.onBeforeSendHeaders.addListener(
  (d) => {
    const c = d.requestHeaders?.find((h) => h.name.toLowerCase() === 'cookie');
    if (c) console.log('[cookie]', d.method, d.url, c.value.slice(0, 60));
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders', 'extraHeaders'],
);
```

在任意页面触发一次带登录态的 XHR/fetch，应能打印真实 Cookie；
若打印不出来，依次检查：权限是否加了、`extraHeaders` 是否带上、
请求目标与 initiator 是否都有 host 权限、是否被 `tabId < 0` / `type` 过滤掉。

### 3.7 风险清单

| 风险 | 影响 | 缓解 |
|---|---|---|
| SW 冷启动窗口丢事件 | 个别请求没有权威值 | 方案 A 用快照兜底；UI 标 `cookieSource`；不承诺 100% 完整 |
| A+B 兜底把"漏事件"补成快照 | 登录 / omit 等场景可能误报（用覆盖换准确） | 只在 `cookieObserved !== true` 时兜底；B 命中时以"权威的空"为准 |
| Blink 内存缓存命中的请求对 webRequest 不可见 | 该条无 Cookie（本身没发网络请求，语义正确） | 接受；必要时 UI 提示 |
| 同 frame 同 URL 并发请求错配 | 极小概率拿到相邻请求的 Cookie | `sentAt` + 300ms 窗口 + 一次性消费；必要时 `documentId` / requestId 时间线 |
| 全站 XHR/fetch 都会唤醒 SW | 耗电 / 噪声 | 监听器首行用内存 `enabled` 标志快速 return（初值异步读配置，接受首帧竞态） |
| `extraHeaders` 对性能有影响 | 官方提示可能有性能开销 | 只在需要权威值时开启（可用构建开关 / 可选权限） |
| 权限与商店审核 | `webRequest` 属敏感 API | 先只做方案 A；B 作为可选增强再上 |

---

## 4. 其他方案为什么不用

| 方案 | 能否拿到 Cookie | 结论 |
|---|---|---|
| `declarativeNetRequest` | ❌ | DNR 的设计目标就是"不拦截、不查看请求内容"（官方文档原话），只能按条件匹配并执行动作；`MatchedRule` / `onRuleMatchedDebug` 的 `RequestDetails` 都不含请求头值。无法回传 Cookie。 |
| `chrome.debugger` + CDP `Network.requestWillBeSentExtraInfo` | ✅（`headers` 即"线上真实头"，`associatedCookies` 还能区分 sent / blocked） | **本项目不可行**：debugger 文档明确 `onDetach` 会在 *"Chrome DevTools is being invoked for the attached tab"* 时触发——本扩展本身就是 DevTools 面板扩展，用户一打开 DevTools 就被 detach。且权限警告重、需要常驻 attach。 |
| `chrome.cookies` | 近似 | 见方案 A。 |
| 页面 `document.cookie` | ❌ | HttpOnly / 跨域 cookie 看不到；分区 cookie 只能看到当前分区内非 HttpOnly 的部分；且与请求上下文无关。 |

---

## 5. 本仓库落地路线

### 5.1 方案对比

| 维度 | 现状（仅 UI 懒查） | A：cookies API 快照 | B：webRequest 权威 | A + B |
|---|---|---|---|---|
| 面板关闭时也能拿到 | ❌ | ✅ | ✅（事件唤醒成功时） | ✅ |
| 与真实发送值一致 | ❌（最晚、最不准） | ❌ 近似 | ✅ 就是真实头 | 接近 |
| 新增权限 | 无 | 无 | `"webRequest"` | 同 B |
| 安装提示变化 | — | 无 | 预期不变（站点提示已由 `<all_urls>` 触发，以实际弹窗为准） | 无 |
| 关联/冲突 | 无 | 无 | 中低（同 URL 并发才会错配） | 低 |
| SW 可靠性依赖 | 无 | 低（sendMessage 唤醒） | 中（冷启动丢事件） | 低（A 兜底） |
| 实现成本 | 0 | 低（~6 文件、~120 行） | 中（~80 行 + 关联） | 中 |

**推荐**：先 A（含 A+ 的 `cookiesSent`），再按需上 B；B 观察到即写 `cookieSource='webrequest'`
（包括"确实没带"的权威空），只有没观察到时才由 A 兜底写 `'snapshot'`，UI 按来源打标签。**不建议**长期停留在现状——
现有懒查有"同名去重"缺陷、只在面板打开时生效、且时刻比请求晚得多。

### 5.2 分阶段清单

**Phase 1（A / A+，建议一次提交）**

> 顺序很重要：先改 `packages/shared/src/types.ts`，否则 background / devtool 引用新字段会报 TS2339。

| 文件 | 改动 |
|---|---|
| `packages/shared/src/types.ts` | `RequestRecord` 加可选 `requestCookie` / `cookieSource` / `cookiesSent` / `sentAt` |
| `packages/background/src/cookie-snapshot.ts`（新增） | `getCookieHeaderSnapshot` / `enrichRecordsWithCookieSnapshot` + 30s 缓存 |
| `packages/background/src/index.ts` | `REQUESTS_BATCH`、`REQUEST_CAPTURED` 先补全再入列；`IMPORT_REQUESTS` 不补全；`REQUESTS_BATCH` 保持 `return true`（异步 `sendResponse`），`REQUEST_CAPTURED` 无 `sendResponse` 则不要 `return true` |
| `packages/devtool/src/utils/cookies.ts` | 删除按 name 去重，直接按 `getAll` 返回顺序拼接 |
| `packages/devtool/src/components/RequestDetail.tsx` | `findCookieHeader(...) ?? record.requestCookie`；HeadersTab 传快照与来源 |
| `packages/devtool/src/components/HeadersTab.tsx` | 无抓包头时优先展示快照并标注来源（"from cookie snapshot"），无快照才回退懒查 |
| `packages/content/src/main-world.ts` | URL 绝对化；记录 `credentials`/`withCredentials` → `cookiesSent`；补 `sentAt` |

**Phase 2（B，独立提交）**

| 文件 | 改动 |
|---|---|
| `manifest.json` | `permissions` 加 `"webRequest"` |
| `packages/background/src/webrequest-cookie.ts`（新增） | 顶层注册 `onBeforeSendHeaders`，`extraHeaders` 采集 + `pending` 关联 |
| `packages/background/src/index.ts` | 顶层调 `registerWebRequestCookieCollector()`；记录到达时 `attachWebRequestCookie(record, sender.tab?.id, sender.frameId ?? 0)`，只对 `cookieObserved !== true` 的记录再走 A 兜底 |

### 5.3 顺手要修的三处既有问题（直接影响本需求）

1. **相对 URL**：`record.url` 可能是 `/api/x`，`chrome.cookies.getAll({ url })` 会抛错被 catch、
   webRequest 关联键也对不上 → main-world 统一按 `document.baseURI` 转绝对 URL；
   同时注意 `CaptureFilter.urlPattern` 的匹配对象从"原始字符串"变成"绝对 URL"（origin 进入匹配范围）。
2. **`startTime` 是 `performance.now()`**：`GeneralTab` 用 `new Date()` 格式化会显示 1970；
   且无法与 webRequest 事件对齐 → 新增 `sentAt`（epoch ms，XHR 要在 `send` 里取，不是在构造时取），显示时优先用它。
3. **`storage.session` 持久化体积**：单条 `responseBody` 上限 1MB（按 `text.length` 计，UTF-16 码元，
   实际字节可能更高），而 `requestBody` **完全没有上限**；500 条理论上远超 10MB 配额，
   而 `persistBuffer()` 的 `catch` 是静默的 → 超配额时持久化会**悄悄失效**。
   另外"500 条"只作用于**存储**：内存 `requestBuffer` 从不截断，GET / Port 回放返回全量。
   这些都不是本需求引入的，但加 Cookie 字段前建议确认现状体积。

---

## 6. 验证清单

### 6.1 构建与类型检查

```bash
pnpm build:ext          # = build + assemble，输出 dist/
# 仓库没有 typecheck/test 脚本，Vite(esbuild) 不做类型检查，改完手动跑：
pnpm exec tsc -p packages/background/tsconfig.json --noEmit
pnpm exec tsc -p packages/content/tsconfig.json --noEmit
pnpm exec tsc -p packages/devtool/tsconfig.json --noEmit
```

`chrome://extensions` → 开发者模式 → 加载 `dist/` → 打开目标页面 → 打开本扩展的 DevTools 面板。

> 注意：完整构建前 `dist/` 可能缺少某个包的产物（例如 devtool），加载后 DevTools 面板打不开；
> 验证前先完整跑一次 `pnpm build:ext`。
> 另外，本仓库当前**只有 HAR 导入**（`utils/har.ts` 的 `parseHar` / `isHarContent`），
> 没有 HAR 导出，本文提到的"HAR 导出时带上 Cookie"均为后续能力，不能作为当前验证项。

### 6.2 对照真值

浏览器原生 DevTools → Network → 选中同一请求 → 右键 **Copy as cURL**，看 `-H 'Cookie: ...'`；
与本扩展面板的 Cookie 行逐值、逐顺序比对。A 方案在"登录后立即发请求""跨域 omit""CHIPS"等场景
允许有差异（见 §2.5 表），B 方案应逐字一致。

### 6.3 测试矩阵

| 场景 | A 期望（快照） | B 期望（仅 B 生效） | A+B 期望 |
|---|---|---|---|
| 同源 fetch，正常带 cookie | 有值 | 有值，逐字一致 | 同 B |
| `fetch(..., { credentials: 'omit' })` | A+ 无值 | 无值 | 无值（B 命中 = 权威空） |
| 跨域 fetch 默认 / XHR 默认 `withCredentials=false` | A+ 无值 | 无值 | 无值（B 命中 = 权威空） |
| 跨域 fetch `credentials: 'include'` | 有值 | 有值且一致 | 同 B |
| POST /login（请求无 Cookie，响应 Set-Cookie） | **会误补新 cookie**（文档/UI 需标注） | 无值（正确） | 无值（B 命中） |
| SW 漏事件（冷启动窗口） | 有值 | 无值（没观察到） | 快照兜底，可能误报（§3.7） |
| 空闲 40s（SW 休眠）后再抓 | 有值（sendMessage 唤醒） | 一般有值（事件唤醒），偶发漏 | 有值 |
| CHIPS（Partitioned）cookie | 漏（需 partitionKey） | 有值 | 同 B |
| 同名不同 path 的 cookie | 两者都在、顺序正确（修复后） | 一致 | 一致 |
| 导入的 HAR 记录 | 不补全 | 不补全 | 不补全 |

### 6.4 存储/来源检查（background SW Console）

```js
const { request_buffer } = await chrome.storage.session.get('request_buffer');
request_buffer.slice(-3).map((r) => [r.url, r.cookieSource, r.cookieObserved, r.requestCookie?.slice(0, 60)]);
new Blob([JSON.stringify({ request_buffer })]).size; // 对照 10MB 配额
```

---

## 7. 隐私与安全

- Cookie 是**凭据**：一旦写入 `requestBuffer` 并持久化到 `storage.session`，扩展任意上下文
  （含未来功能代码）都能读到；HAR 导出/分享会直接泄露会话。
- 建议：默认**脱敏展示**（只显示 cookie 名称/数量/长度，点击"显示"再展开），
  HAR 导出时提供"去掉 Cookie"选项；文档/日志中不打印完整 Cookie 值。
- `webRequest` 属敏感权限，商店审核需要说明用途（"读取请求头以关联抓包记录并展示登录态"），
  并遵守最小权限原则（能只做 A 就先只做 A）。

---

## 8. 事实依据与版本要求

| 能力 | 最低版本 / 条件 |
|---|---|
| `chrome.webRequest` 观察型（MV3） | MV3（Chrome 88+）+ `"webRequest"` 权限 + 目标/initiator 双边 host 权限 |
| `webRequestBlocking`（MV3） | 仅 policy / force-installed 扩展；普通扩展不可用 |
| webRequest 读到 `Cookie` | Chrome 72+，且 `extraInfoSpec` 含 `"extraHeaders"` |
| `requestId` 跨事件稳定 | 全版本（一次浏览器会话内唯一），但页面侧不可见 |
| `documentId`（webRequest / `MessageSender`） | Chrome 106+ |
| `chrome.cookies.getAll` | MV3（Chrome 88+ 起 Promise）；含 HttpOnly；返回按 path/创建时间排序 |
| `partitionKey`（cookies API） | Chrome 119+ |
| `chrome.cookies.getPartitionKey` | Chrome 132+ |
| CHIPS（Partitioned cookie） | Chrome 114+ |
| `chrome.debugger` | 可用 CDP `Network`，但打开 DevTools 会 detach（本项目排除） |
| SW 生命周期 | 空闲 30s 终止；事件唤醒并重置计时（Chrome 110+）；单次事件/请求处理超过 5 分钟会被终止；监听器必须顶层同步注册 |

参考链接：

- [chrome.webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest)
- [MV3 迁移：blocking web requests](https://developer.chrome.com/docs/extensions/develop/migrate/blocking-web-requests)
- [chrome.cookies](https://developer.chrome.com/docs/extensions/reference/api/cookies)
- [Service worker 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Service worker 事件（顶层注册）](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events)
- [Content scripts（可访问的 API 子集）](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [chrome.storage（session 配额）](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) / [chrome.debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger)
- [Fetch 规范：forbidden request header](https://fetch.spec.whatwg.org/#forbidden-request-header) / [附录 Cookie 头](https://fetch.spec.whatwg.org/#http-cookie-header)
- [RFC 6265 §5.4](https://www.rfc-editor.org/rfc/rfc6265#section-5.4) / [CHIPS](https://developer.chrome.com/docs/privacy-sandbox/chips)
- [MDN: Forbidden request header](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header) / [Request.credentials](https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials) / [XMLHttpRequest.withCredentials](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/withCredentials)
- [CDP Network domain](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
