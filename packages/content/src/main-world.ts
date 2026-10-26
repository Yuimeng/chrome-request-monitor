/**
 * 模块：content / main-world —— 页面主世界脚本（请求 hook 层）
 *
 * 组成：
 *   - matchesFilter   依 CaptureFilter 判断单个请求是否需要抓取（类型开关/URL 关键字/HTTP 方法）
 *   - generateId      生成 UUID v4 作为请求记录 id
 *   - patchFetch      替换 window.fetch：记录方法/URL/头/体/耗时/响应，构造 RequestRecord
 *   - patchXHR        替换 window.XMLHttpRequest：hook open/setRequestHeader/send，
 *     在 loadend 时解析响应头与响应体并构造 RequestRecord
 *   - restore         关闭监控时恢复原始 fetch / XMLHttpRequest
 *   - MONITOR_CONFIG  监听 isolated-world 下发的配置事件，决定 patch 还是 restore
 *
 * 协作：
 *   - 由 isolated-world 注入到页面；只能通过 CustomEvent 与外界通信（无 chrome.* 权限）：
 *     接收 EVENTS.MONITOR_CONFIG（配置），发送 EVENTS.REQUEST_CAPTURED（捕获结果）
 *   - 响应体仅在 content-type 含 text/json 且 ≤ MAX_BODY_SIZE(1MB) 时记录
 *   - fetch 失败（网络错误）也会记录，status 记为 0
 *   - 方案 A+（Cookie 捕获降误报）：URL 统一绝对化为 document.baseURI 基准，并记录
 *     cookiesSent（本次请求发送语义上是否带 Cookie）与 sentAt（墙钟发送时刻）两个可选字段
 */
import { EVENTS, MAX_BODY_SIZE } from "@request-monitor/shared";
import type { CaptureFilter } from "@request-monitor/shared";

let fetchActive = false;              // 是否已 patch fetch（防止重复 patch）
let xhrActive = false;                // 是否已 patch XHR
let currentFilter: CaptureFilter = { urlPattern: "", captureFetch: true, captureXHR: true, methods: [] };
let originalFetch: typeof window.fetch;      // 备份的原始 fetch，用于 restore
let originalXHR: typeof window.XMLHttpRequest;

// 抓取过滤：三个维度全部通过才捕获（类型开关 → URL 子串 → 方法白名单）
function matchesFilter(method: string, url: string, type: "fetch" | "xhr"): boolean {
  if (type === "fetch" && !currentFilter.captureFetch) return false;
  if (type === "xhr" && !currentFilter.captureXHR) return false;
  if (currentFilter.urlPattern && !url.toLowerCase().includes(currentFilter.urlPattern.toLowerCase())) return false;
  if (currentFilter.methods.length > 0 && !currentFilter.methods.includes(method)) return false;
  return true;
}

// ===== 方案 A+ 辅助：URL 绝对化 / 发送语义判定 =====
// URL 解析统一以 document.baseURI 为基准（页面存在 <base href> 时 location.href 不是正确基准）；
// 解析失败回退原字符串，保证 hook 永远不会因异常 URL 影响页面自身请求
function toAbsoluteUrl(url: string): string {
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return url;
  }
}

// 目标 URL 是否与当前页面同源；无法解析时按“不同源”处理（宁可少补 Cookie，避免误报）
function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, document.baseURI).origin === location.origin;
  } catch {
    return false;
  }
}

// fetch 的 input 联合类型（string | URL | Request）中只有 Request 带 credentials 语义；
// 用结构化判断而非 instanceof，兼容来自其他 realm（iframe）的 Request 对象
function isRequest(input: RequestInfo | URL): input is Request {
  return typeof input === "object" && input !== null && "credentials" in input;
}

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = (b: number) => b.toString(16).padStart(2, '0');
  return hex(bytes[0]) + hex(bytes[1]) + hex(bytes[2]) + hex(bytes[3]) + '-'
    + hex(bytes[4]) + hex(bytes[5]) + '-' + hex(bytes[6]) + hex(bytes[7]) + '-'
    + hex(bytes[8]) + hex(bytes[9]) + '-' + hex(bytes[10]) + hex(bytes[11]) + hex(bytes[12]) + hex(bytes[13]) + hex(bytes[14]) + hex(bytes[15]);
}

// patch window.fetch：包装原生实现，请求完成后组装 RequestRecord 并派发事件
function patchFetch() {
  if (fetchActive) return;
  fetchActive = true;
  originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const startTime = performance.now();
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    // 方案 A+：record.url 统一记录绝对 URL（background 的 chrome.cookies.getAll({url})
    // 与 webRequest 关联都要求绝对 URL）；解析失败时 toAbsoluteUrl 回退原字符串
    const requestUrl = toAbsoluteUrl(rawUrl);
    const requestMethod = (
      init?.method ?? (isRequest(input) ? input.method : undefined) ?? "GET"
    ).toUpperCase();

    // 发送语义判定（方案 A+）：Cookie 是 forbidden request header，页面读不到实际值，
    // 但可以判断“这次请求按 fetch 语义是否带 Cookie”，供 background 跳过明显不会带 Cookie 的请求。
    // credentials 优先级：init 显式指定 > Request 对象自身 > fetch 默认值 same-origin
    const credentials: RequestCredentials =
      init?.credentials ?? (isRequest(input) ? input.credentials : "same-origin");
    const cookiesSent =
      credentials === "include" ||
      (credentials === "same-origin" && isSameOrigin(requestUrl));

    // 墙钟发送时刻（epoch ms）：startTime 是 performance.now() 相对值，既无法与 webRequest 对齐，
    // 也无法直接格式化为日期；声明在 try 之外，保证失败路径同样能带上
    const sentAt = Date.now();
    const requestHeaders: [string, string][] = [];

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => requestHeaders.push([k, v]));
      } else if (Array.isArray(init.headers)) {
        requestHeaders.push(...(init.headers as [string, string][]));
      } else {
        Object.entries(init.headers).forEach(([k, v]) =>
          requestHeaders.push([k, v]),
        );
      }
    }

    let requestBody: string | undefined;
    if (init?.body) {
      requestBody =
        typeof init.body === "string" ? init.body : "[non-text body]";
    }

    try {
      const response = await originalFetch(input, init);
      const duration = performance.now() - startTime;

      let responseBody: string | undefined;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text") || contentType.includes("json")) {
        const cloned = response.clone();
        const text = await cloned.text();
        if (text.length <= MAX_BODY_SIZE) {
          responseBody = text;
        }
      }

      // 成功路径：命中过滤则派发捕获事件给 isolated-world（status 为真实响应码）
      if (matchesFilter(requestMethod, requestUrl, "fetch")) {
        window.dispatchEvent(
        new CustomEvent(EVENTS.REQUEST_CAPTURED, {
          detail: {
            id: generateId(),
            method: requestMethod,
            url: requestUrl,
            requestHeaders,
            requestBody,
            responseStatus: response.status,
            responseHeaders: Array.from(response.headers.entries()),
            responseBody,
            startTime,
            duration,
            // 方案 A+：成功路径同样携带发送语义与墙钟时刻
            cookiesSent,
            sentAt,
            type: "fetch",
          },
        }),
      );
    }

      return response;
    } catch (error) {
      // 失败路径（网络错误/中断）：同样记录，status=0 表示请求未完成，随后原样抛出不影响页面逻辑
      const duration = performance.now() - startTime;
      if (matchesFilter(requestMethod, requestUrl, "fetch")) {
        window.dispatchEvent(
        new CustomEvent(EVENTS.REQUEST_CAPTURED, {
          detail: {
            id: generateId(),
            method: requestMethod,
            url: requestUrl,
            requestHeaders,
            requestBody,
            responseStatus: 0,
            responseHeaders: [],
            responseBody: undefined,
            startTime,
            duration,
            // 方案 A+：失败路径（status=0）也要带上，否则 background 无法判断该请求是否可能有 Cookie
            cookiesSent,
            sentAt,
            type: "fetch",
          },
        }),
      );
      }
      throw error;
    }
  };

  console.log("patched");
}

// patch XMLHttpRequest：逐方法 hook（open 拿 method/url、setRequestHeader 收头、send 收 body），
// loadend 事件触发时表示响应完成，在此解析响应并派发捕获事件
function patchXHR() {
  if (xhrActive) return;
  xhrActive = true;
  originalXHR = window.XMLHttpRequest;

  const OriginalXHR = originalXHR;
  window.XMLHttpRequest = function () {
    const xhr = new OriginalXHR();
    const startTime = performance.now();
    let method = "GET";
    let requestUrl = "";
    let requestBody: string | undefined;
    const requestHeaders: [string, string][] = [];

    const originalOpen = xhr.open.bind(xhr);
    xhr.open = function (m: string, url: string | URL) {
      method = m.toUpperCase();
      // 方案 A+：XHR 的 url 同样绝对化，供 cookiesSent 判定与 background 补全 Cookie 使用
      requestUrl = toAbsoluteUrl(typeof url === "string" ? url : url.href);
      originalOpen(m, url);
    };

    const originalSetRequestHeader = xhr.setRequestHeader.bind(xhr);
    xhr.setRequestHeader = function (name: string, value: string) {
      requestHeaders.push([name, value]);
      originalSetRequestHeader(name, value);
    };

    const originalSend = xhr.send.bind(xhr);
    xhr.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      requestBody = typeof body === "string" ? body : undefined;

      // 发送语义判定（方案 A+）：必须在 send 处读取 withCredentials——页面可能在 open 之后、
      // send 之前设置它，构造函数/send 之前的任何时刻读到的值都不可靠。
      // 规则：同源请求总是带 Cookie；跨域默认不带（withCredentials 默认 false），显式 true 才带
      const cookiesSent = isSameOrigin(requestUrl) || xhr.withCredentials;
      // 墙钟发送时刻：XHR 的 startTime 取在构造函数里，与实际发送时刻可能相差很远
      const sentAt = Date.now();

      // loadend：请求结束（成功或失败都会触发），此时可安全读取 xhr.status/responseText
      xhr.addEventListener("loadend", () => {
        const duration = performance.now() - startTime;
        let responseBody: string | undefined;
        const contentType = xhr.getResponseHeader("content-type") || "";
        if (
          (contentType.includes("text") || contentType.includes("json")) &&
          xhr.responseText
        ) {
          if (xhr.responseText.length <= MAX_BODY_SIZE) {
            responseBody = xhr.responseText;
          }
        }

        const responseHeaders: [string, string][] = [];
        const headerText = xhr.getAllResponseHeaders();
        headerText
          .split("\r\n")
          .filter(Boolean)
          .forEach((line) => {
            const colonIdx = line.indexOf(":");
            if (colonIdx > 0) {
              responseHeaders.push([
                line.slice(0, colonIdx),
                line.slice(colonIdx + 2),
              ]);
            }
          });

      if (matchesFilter(method, requestUrl, "xhr")) {
        window.dispatchEvent(
          new CustomEvent(EVENTS.REQUEST_CAPTURED, {
            detail: {
              id: generateId(),
              method,
              url: requestUrl,
              requestHeaders,
              requestBody,
              responseStatus: xhr.status,
              responseHeaders,
              responseBody,
              startTime,
              duration,
              // 方案 A+：XHR 成功/失败（loadend 统一触发）都携带发送语义与墙钟时刻
              cookiesSent,
              sentAt,
              type: "xhr",
            },
          }),
        );
      }
      });

      originalSend(body);
    };

    return xhr;
  } as unknown as typeof window.XMLHttpRequest;

  Object.keys(OriginalXHR).forEach((key) => {
    (window.XMLHttpRequest as any)[key] = (OriginalXHR as any)[key];
  });
}

// 关闭监控：还原被替换的 fetch 与 XMLHttpRequest 原型，页面行为完全恢复
function restore() {
  if (fetchActive && originalFetch) {
    window.fetch = originalFetch;
    fetchActive = false;
  }
  if (xhrActive && originalXHR) {
    window.XMLHttpRequest = originalXHR;
    xhrActive = false;
  }
}

// 配置入口：isolated-world 下发的开关与过滤规则；enabled=true 打补丁，false 还原
window.addEventListener(EVENTS.MONITOR_CONFIG, ((event: CustomEvent) => {
  currentFilter = event.detail.filter ?? currentFilter;
  if (event.detail.enabled) {
    patchFetch();
    patchXHR();
  } else {
    restore();
  }
}) as EventListener);
