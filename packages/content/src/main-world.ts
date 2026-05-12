import { EVENTS, MAX_BODY_SIZE } from "@request-monitor/shared";
import type { CaptureFilter } from "@request-monitor/shared";

let active = false;
let currentFilter: CaptureFilter = { urlPattern: "", captureFetch: true, captureXHR: true, methods: [] };
let originalFetch: typeof window.fetch;
let originalXHR: typeof window.XMLHttpRequest;

function matchesFilter(method: string, url: string, type: "fetch" | "xhr"): boolean {
  if (type === "fetch" && !currentFilter.captureFetch) return false;
  if (type === "xhr" && !currentFilter.captureXHR) return false;
  if (currentFilter.urlPattern && !url.toLowerCase().includes(currentFilter.urlPattern.toLowerCase())) return false;
  if (currentFilter.methods.length > 0 && !currentFilter.methods.includes(method)) return false;
  return true;
}

function generateId(): string {
  return crypto.randomUUID();
}

function patchFetch() {
  if (active) return;
  active = true;
  originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const startTime = performance.now();
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const requestMethod = (
      init?.method ??
      (typeof input === "object" && "method" in input
        ? input.method
        : undefined) ??
      "GET"
    ).toUpperCase();
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
            type: "fetch",
          },
        }),
      );
    }

      return response;
    } catch (error) {
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

function patchXHR() {
  if (active) return;
  active = true;
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
      requestUrl = typeof url === "string" ? url : url.href;
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

function restore() {
  if (!active) return;
  if (originalFetch) window.fetch = originalFetch;
  if (originalXHR) window.XMLHttpRequest = originalXHR;
  active = false;
}

window.addEventListener(EVENTS.MONITOR_CONFIG, ((event: CustomEvent) => {
  currentFilter = event.detail.filter ?? currentFilter;
  if (event.detail.enabled) {
    patchFetch();
    patchXHR();
  } else {
    restore();
  }
}) as EventListener);
