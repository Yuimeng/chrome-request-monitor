/**
 * 模块：devtool / components / HeadersTab —— 请求/响应头标签页
 *
 * 组成：
 *   - [name, value] 数组渲染为两列表格，空数据显示占位提示
 *   - cookieUrl 传入时，若抓包头里没有 Cookie（实时抓包必然没有：浏览器自动附加的头
 *     JS 读不到），按该 URL 从 chrome.cookies 补一行，并标注来源
 *
 * 协作：RequestDetail 用同一组件分别渲染 requestHeaders 与 responseHeaders；
 *   仅请求头标签页传 cookieUrl，cookie 读取逻辑见 utils/cookies。
 */
import { useEffect, useState } from 'react';
import { findCookieHeader, readCookieFromStore } from '../utils/cookies';

interface HeadersTabProps {
  headers: [string, string][];
  title: string;
  /** 传入后，抓包头缺少 Cookie 时按该 URL 从浏览器 cookie store 补展示 */
  cookieUrl?: string;
}

interface HeaderRow {
  name: string;
  value: string;
  /** 该行由 cookie store 解析而来，并非抓包记录中的原始头 */
  synthesized?: boolean;
}

export default function HeadersTab({ headers, title, cookieUrl }: HeadersTabProps) {
  const capturedCookie = findCookieHeader(headers);
  const [storedCookie, setStoredCookie] = useState<string | null>(null);

  useEffect(() => {
    setStoredCookie(null);
    if (capturedCookie || !cookieUrl) return;
    let cancelled = false;
    readCookieFromStore(cookieUrl).then((cookie) => {
      if (!cancelled && cookie) setStoredCookie(cookie);
    });
    return () => {
      cancelled = true;
    };
  }, [capturedCookie, cookieUrl]);

  const rows: HeaderRow[] = headers.map(([name, value]) => ({ name, value }));
  if (!capturedCookie && storedCookie) {
    rows.push({ name: 'Cookie', value: storedCookie, synthesized: true });
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
        {rows.map(({ name, value, synthesized }, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '4px 12px', color: '#8B4513', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              {name}
            </td>
            <td style={{ padding: '4px 12px', color: '#333', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {value}
              {synthesized && (
                <span
                  title="Cookie 由浏览器 cookie store 按请求 URL 解析得到，抓包请求头中不含该头"
                  style={{ marginLeft: 8, fontSize: 10, color: '#999', whiteSpace: 'nowrap' }}
                >
                  from cookie store
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
