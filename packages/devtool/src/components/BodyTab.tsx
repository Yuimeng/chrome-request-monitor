/**
 * 模块：devtool / components / BodyTab —— 请求/响应体查看器（含解密能力）
 *
 * 组成：
 *   - handleCopy      复制当前内容（解密后优先复制解密结果），用隐藏 textarea + execCommand
 *   - handleDecrypt   发送 DECRYPT_REQUEST 给 background，由其代理 POST 到外部解密服务（15s 超时）；
 *     载荷里的 cookie 只带当前这条请求自己的 Cookie（抓包头，或实时抓包由 background 补的
 *     requestCookie 快照），不再实时回查 cookie store——避免把请求发生之后才变化/新增的
 *     cookie 混进这条历史请求的解密上下文
 *   - 自动解密         mount 时若 autoDecrypt 且配置齐全则直接触发（key 重挂载保证按记录触发）
 *   - 渲染             统一交给 JsonEditor（CodeMirror 只读）：JSON 自动排序 + 高亮缩进，
 *     非 JSON 原样只读展示；解密成功后背景变黄以示区分
 *
 * 协作：RequestDetail 传入 body/decryptPayload/decryptUrl/cookieHeader；
 *   解密请求经 background 中转（避免面板侧跨域限制），结果回写 decrypted 状态。
 */
import {useEffect, useState} from "react";
import {JsonEditor} from "./JsonEditor";


interface BodyTabProps {
  body: string | undefined;
  label: string;
  decryptPayload?: unknown;
  decryptUrl?: string;
  autoDecrypt?: boolean;
  /** 当前请求自身携带的 Cookie（抓包头 / requestCookie 快照）；缺失时解密载荷不带 cookie */
  cookieHeader?: string;
}

/** 把 cookie 合并进解密载荷；非对象载荷（数组/字符串等）原样透传 */
function attachCookie(payload: unknown, cookie: string): unknown {
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>), cookie };
  }
  return payload;
}

export default function BodyTab({
  body,
  label,
  decryptPayload,
  decryptUrl,
  autoDecrypt,
  cookieHeader,
}: BodyTabProps) {
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = decrypted ?? body;
    if (!text) return;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDecrypt = () => {
    if (!decryptUrl || !decryptPayload) return;
    setDecrypting(true);
    setDecryptError(null);
    // 只传当前请求自身携带的 cookie（抓包头，或 background 在入列时补的 requestCookie 快照）；
    // 缺失时不回退 cookie store，避免把请求之后才变化/新增的 cookie 混进这条历史请求
    const cookie = cookieHeader;
    try {
      chrome.runtime.sendMessage(
        {
          type: "DECRYPT_REQUEST",
          payload: {
            url: decryptUrl,
            body: cookie ? attachCookie(decryptPayload, cookie) : decryptPayload,
            headers: { "Content-Type": "application/json" },
            timeoutMs: 15000,
          },
        },
        (response) => {
          if (response.success) {
            setDecrypted(response.data);
          } else {
            setDecryptError(response.error ?? "Decrypt failed");
          }
          setDecrypting(false);
        },
      );
    } catch (err) {
      setDecryptError(err instanceof Error ? err.message : "Decrypt failed");
      setDecrypting(false);
    }
  };

  useEffect(() => {
    if (autoDecrypt !== false && decryptUrl && decryptPayload) {
      handleDecrypt();
    }
  }, []); // key prop on BodyTab ensures re-mount on record change, so no deps needed

  const content = decrypted ?? body;

  if (!content) {
    return (
      <p style={{ padding: "12px", color: "#999", fontSize: "12px" }}>
        No {label.toLowerCase()} available
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          gap: "6px",
          alignItems: "center",
        }}
      >
        <button
          onClick={handleCopy}
          style={{
            padding: "3px 10px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            background: copied ? "#e8f5e9" : "#fff",
            color: copied ? "#2e7d32" : "#666",
            fontSize: "11px",
            cursor: "pointer",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        {decryptUrl && !!decryptPayload && (
          <button
            onClick={handleDecrypt}
            disabled={decrypting}
            style={{
              padding: "3px 10px",
              border: "1px solid #ff9800",
              borderRadius: "4px",
              background: decrypting ? "#fff3e0" : "#fff8e1",
              color: "#e65100",
              fontSize: "11px",
              cursor: decrypting ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {decrypting ? "Decrypting..." : "Decrypt"}
          </button>
        )}
        {decryptUrl && !!decryptPayload && decrypted && (
          <button
            onClick={() => {
              setDecrypted(null);
              setDecryptError(null);
            }}
            style={{
              padding: "3px 10px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              background: "#fff",
              color: "#666",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            Original
          </button>
        )}
        {decryptError && (
          <span style={{ color: "#d32f2f", fontSize: "11px" }}>
            {decryptError}
          </span>
        )}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          background: decrypted ? "#fffde7" : "#fafafa",
        }}
      >
        <JsonEditor
          content={content}
          background={decrypted ? "#fffde7" : "#fafafa"}
        />
      </div>
    </div>
  );
}
