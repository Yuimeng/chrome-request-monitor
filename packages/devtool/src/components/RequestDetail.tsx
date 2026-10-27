/**
 * 模块：devtool / components / RequestDetail —— 右侧详情面板（标签页容器）
 *
 * 组成：
 *   - TABS 五个标签页：Request Body / Response Body / General / Request Headers / Response Headers
 *   - parseUrlParams / extractQueryKey  请求体为空时回退用 URL 查询参数填充 payload（用于解密）
 *   - requestCookie  当前请求自身携带的 Cookie 取值：优先抓包请求头（HAR 导入），其次记录里的
 *     requestCookie 快照 / webRequest 权威值（实时抓包由 background 补全）；同一个值同时传给
 *     Request Headers 展示与 BodyTab 解密（devtool 不再读取浏览器 cookie store）
 *   - BodyTab 渲染时通过 key={record.id+...} 强制重挂载，切换记录会重新触发自动解密
 *
 * 协作：向上接收选中的 record 与 decryptUrl；向下分发 GeneralTab/HeadersTab/BodyTab；
 *   响应体的解密 payload 会合并请求体中的 key（缺失时从 URL ?key= 提取）。
 */
import { useState } from 'react';
import type { RequestRecord } from '@request-monitor/shared';
import { STORAGE_KEYS } from '@request-monitor/shared';
import { useStorage } from '../hooks/useStorage';
import { findCookieHeader, resolveRequestCookie } from '../utils/cookies';
import GeneralTab from './GeneralTab';
import HeadersTab from './HeadersTab';
import BodyTab from './BodyTab';


interface RequestDetailProps {
  record: RequestRecord;
  decryptUrl?: string;
  onClose?: () => void;
}

function extractQueryKey(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get('key') || undefined;
  } catch {
    // url may be a path without domain
    try {
      return new URL(url, 'http://localhost').searchParams.get('key') || undefined;
    } catch {
      return undefined;
    }
  }
}

function parseUrlParams(url: string): Record<string, string> {
  try {
    const params = new URL(url).searchParams;
    const obj: Record<string, string> = {};
    params.forEach((v, k) => { obj[k] = v; });
    return obj;
  } catch {
    try {
      const params = new URL(url, 'http://localhost').searchParams;
      const obj: Record<string, string> = {};
      params.forEach((v, k) => { obj[k] = v; });
      return obj;
    } catch {
      return {};
    }
  }
}

const TABS = [
  "Request Body",
  "Response Body",
  "General",
  "Request Headers",
  "Response Headers",
] as const;

export default function RequestDetail({ record, decryptUrl, onClose }: RequestDetailProps) {
  const [activeTab, setActiveTab] = useState<string>("Request Body");
  const [autoDecrypt] = useStorage(STORAGE_KEYS.AUTO_DECRYPT, true);
  let requestBody, responseBody;
  try {
    requestBody = record.requestBody ? JSON.parse(record.requestBody) : parseUrlParams(record.url);
    responseBody = record.responseBody ? JSON.parse(record.responseBody) : {};
  } catch {
    //
  }
  // 当前请求自身携带的 Cookie：抓包头（HAR 导入 / 页面显式设置）优先，其次实时抓包时
  // background 在入列前补的 requestCookie 快照。展示与解密共用这一个值，devtool 不再读
  // 浏览器 cookie store，避免面板显示与解密载荷出现两套 cookie。
  const requestCookie = resolveRequestCookie(record);
  const capturedCookie = findCookieHeader(record.requestHeaders);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #ddd', background: '#fafafa' }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 12px',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #1976D2' : '2px solid transparent',
              background: activeTab === tab ? '#fff' : 'transparent',
              cursor: 'pointer',
              fontSize: '12px',
              color: activeTab === tab ? '#1976D2' : '#666',
              fontWeight: activeTab === tab ? 600 : 400,
            }}
          >
            {tab}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            style={{
              marginRight: '8px',
              padding: '2px 8px',
              border: 'none',
              borderRadius: '4px',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '24px',
              color: '#999',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'General' && <GeneralTab record={record} />}
        {activeTab === 'Request Headers' && (
          <HeadersTab
            headers={record.requestHeaders}
            title="Request Headers"
            requestCookie={capturedCookie ? undefined : record.requestCookie}
            cookieSource={capturedCookie ? undefined : record.cookieSource}
            cookieObserved={capturedCookie || requestCookie ? undefined : record.cookieObserved}
          />
        )}
        {activeTab === 'Response Headers' && <HeadersTab headers={record.responseHeaders} title="Response Headers" />}
        {activeTab === 'Request Body' && (
          <BodyTab
            key={record.id + '-request'}
            body={record.requestBody}
            label="Request Body"
            decryptUrl={decryptUrl}
            decryptPayload={requestBody}
            cookieHeader={requestCookie}
            autoDecrypt={autoDecrypt}
          />
        )}
        {activeTab === 'Response Body' && (
          <BodyTab
            key={record.id + '-response'}
            body={record.responseBody}
            label="Response Body"
            decryptUrl={decryptUrl}
            decryptPayload={{ ...responseBody, key: requestBody?.key || extractQueryKey(record.url) }}
            cookieHeader={requestCookie}
            autoDecrypt={autoDecrypt}
          />
        )}
      </div>
    </div>
  );
}
