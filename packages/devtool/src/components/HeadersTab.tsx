/**
 * 模块：devtool / components / HeadersTab —— 请求/响应头标签页
 *
 * 组成：
 *   - [name, value] 数组渲染为两列表格，空数据显示占位提示
 *   - Cookie 行的补展示（优先级从高到低）：
 *       1. 抓包头里已有 Cookie（HAR 导入）→ 原样展示
 *       2. 记录自带快照/权威值（snapshotCookie）→ 展示并标注来源
 *          （snapshot → "from cookie snapshot"，webrequest → "from webRequest"）
 *       3. cookieObserved === true → 展示权威结论 "no Cookie sent (from webRequest)"，
 *          不伪造 cookie 值（webRequest 已观察到该请求且确实没带 Cookie）
 *       4. cookieUrl 传入时按 URL 从 chrome.cookies 懒查，标注 "from cookie store"
 *
 * 协作：RequestDetail 用同一组件分别渲染 requestHeaders 与 responseHeaders；
 *   仅请求头标签页传 Cookie 相关 props，且全部可选——响应头调用不传时行为完全不变。
 *   cookie 读取逻辑见 utils/cookies。
 */
import { useEffect, useState } from 'react';
import { findCookieHeader, readCookieFromStore } from '../utils/cookies';

interface HeadersTabProps {
  headers: [string, string][];
  title: string;
  /** 传入后，抓包头缺少 Cookie 时按该 URL 从浏览器 cookie store 补展示 */
  cookieUrl?: string;
  /** 记录里的 Cookie 快照或 webRequest 权威值（仅请求头标签页在抓包头无 Cookie 时传入） */
  snapshotCookie?: string;
  /** snapshotCookie 的来源，用于标注；不传按 snapshot 处理 */
  cookieSource?: 'header' | 'snapshot' | 'webrequest';
  /** webRequest 已观察该请求：为 true 且无 Cookie 值时展示权威结论“no Cookie sent” */
  cookieObserved?: boolean;
}

interface HeaderRow {
  name: string;
  /** 行值；observedAbsent 行没有值（不伪造 cookie） */
  value?: string;
  /** 该行由 cookie 快照/store 解析而来，并非抓包记录中的原始头 */
  synthesized?: boolean;
  /** synthesized 行的来源标注文案 */
  sourceLabel?: string;
  /** 来源标注的悬浮说明 */
  sourceTitle?: string;
  /** webRequest 的权威结论：该请求确实没有发送 Cookie 头 */
  observedAbsent?: boolean;
}

const SOURCE_TITLES = {
  snapshot:
    'Cookie 由扩展在请求入列前按 URL 读取 cookies API 生成，是近似快照（不是抓包记录中的原始头）',
  webrequest: 'Cookie 来自 webRequest 观察到的真实发送头',
  store: 'Cookie 由浏览器 cookie store 按请求 URL 解析得到，抓包请求头中不含该头',
} as const;

export default function HeadersTab({
  headers,
  title,
  cookieUrl,
  snapshotCookie,
  cookieSource,
  cookieObserved,
}: HeadersTabProps) {
  const capturedCookie = findCookieHeader(headers);
  // 已有抓包头 / 记录快照 / webRequest 权威结论时不再懒查 store：
  // 快照与请求时刻更接近，也避免异步读取覆盖掉更可信的来源
  const skipStoreLookup = !!capturedCookie || !!snapshotCookie || cookieObserved === true;
  const [storedCookie, setStoredCookie] = useState<string | null>(null);

  useEffect(() => {
    setStoredCookie(null);
    if (skipStoreLookup || !cookieUrl) return;
    let cancelled = false;
    readCookieFromStore(cookieUrl).then((cookie) => {
      if (!cancelled && cookie) setStoredCookie(cookie);
    });
    return () => {
      cancelled = true;
    };
  }, [skipStoreLookup, cookieUrl]);

  const rows: HeaderRow[] = headers.map(([name, value]) => ({ name, value }));
  if (!capturedCookie) {
    if (snapshotCookie) {
      const isWebRequest = cookieSource === 'webrequest';
      rows.push({
        name: 'Cookie',
        value: snapshotCookie,
        synthesized: true,
        sourceLabel: isWebRequest ? 'from webRequest' : 'from cookie snapshot',
        sourceTitle: isWebRequest ? SOURCE_TITLES.webrequest : SOURCE_TITLES.snapshot,
      });
    } else if (cookieObserved === true) {
      // 权威空值：webRequest 观察到该请求且确实没有 Cookie 头，不伪造值
      rows.push({ name: 'Cookie', observedAbsent: true });
    } else if (storedCookie) {
      rows.push({
        name: 'Cookie',
        value: storedCookie,
        synthesized: true,
        sourceLabel: 'from cookie store',
        sourceTitle: SOURCE_TITLES.store,
      });
    }
  }

  if (rows.length === 0) {
    return (
      <p style={{ padding: '12px', color: '#999', fontSize: '12px' }}>
        No {title.toLowerCase()} available
      </p>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
      <thead>
        <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
          <th style={{ padding: '6px 12px', textAlign: 'left', color: '#666', width: '250px' }}>Name</th>
          <th style={{ padding: '6px 12px', textAlign: 'left', color: '#666' }}>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ name, value, synthesized, sourceLabel, sourceTitle, observedAbsent }, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '4px 12px', color: '#8B4513', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              {name}
            </td>
            <td style={{ padding: '4px 12px', color: '#333', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {observedAbsent ? (
                <span style={{ color: '#999', fontStyle: 'italic', fontFamily: 'inherit' }}>
                  no Cookie sent (from webRequest)
                </span>
              ) : (
                <>
                  {value}
                  {synthesized && sourceLabel && (
                    <span
                      title={sourceTitle}
                      style={{ marginLeft: 8, fontSize: 10, color: '#999', whiteSpace: 'nowrap' }}
                    >
                      {sourceLabel}
                    </span>
                  )}
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
