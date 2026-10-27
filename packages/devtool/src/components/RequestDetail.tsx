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

// 主标签 + Request/Response 子切换：5 个长标签在 300px 窄面板下必然溢出，
// 之前靠横向滚动兜底，滚动条会压住 30px 标签栏并裁掉激活态下划线。
// 拆成 3 个主标签 + 2 个子切换后总宽度恒定可控，任何宽度都不再产生滚动。
const SECTIONS = [
  { key: 'body', label: 'Body', title: 'Request / Response Body' },
  { key: 'headers', label: 'Headers', title: 'Request / Response Headers' },
  { key: 'general', label: 'General', title: 'General' },
] as const;

type Section = (typeof SECTIONS)[number]['key'];
type Side = 'request' | 'response';

export default function RequestDetail({ record, decryptUrl, onClose }: RequestDetailProps) {
  const [section, setSection] = useState<Section>('body');
  const [side, setSide] = useState<Side>('request');
  const [autoDecrypt] = useStorage(STORAGE_KEYS.AUTO_DECRYPT, true);
  let requestBody, responseBody;
  try {
    requestBody = record.requestBody ? JSON.parse(record.requestBody) : parseUrlParams(record.url);
    responseBody = record.responseBody ? JSON.parse(record.responseBody) : {};
  } catch {
    //
  }
  // 当前请求自身携带的 Cookie：抓包头（HAR 导入 / 页面显式设置）优先，其次实时抓包时
  // background 在入列前补的 requestCookie 快照。展示与解密共用这一个值，devtools 不再读
  // 浏览器 cookie store，避免面板显示与解密载荷出现两套 cookie。
  const requestCookie = resolveRequestCookie(record);
  const capturedCookie = findCookieHeader(record.requestHeaders);

  return (
    <div className="detail-pane">
      <div className="detail-tabs">
        <div className="detail-tabs-group" role="tablist">
          {SECTIONS.map(({ key, label, title }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={section === key}
              title={title}
              onClick={() => setSection(key)}
              className={section === key ? 'tab is-active' : 'tab'}
            >
              {label}
            </button>
          ))}
        </div>

        {section !== 'general' && (
          <div className="side-toggle" role="group" aria-label="Request or response">
            <button
              type="button"
              className={side === 'request' ? 'side-btn is-active' : 'side-btn'}
              aria-pressed={side === 'request'}
              onClick={() => setSide('request')}
            >
              Request
            </button>
            <button
              type="button"
              className={side === 'response' ? 'side-btn is-active' : 'side-btn'}
              aria-pressed={side === 'response'}
              onClick={() => setSide('response')}
            >
              Response
            </button>
          </div>
        )}

        <div className="tab-spacer" />
        {onClose && (
          <button type="button" className="icon-btn" onClick={onClose} title="Close panel" aria-label="Close panel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="detail-body">
        {section === 'general' && <GeneralTab record={record} />}

        {section === 'headers' && (side === 'request' ? (
          <HeadersTab
            headers={record.requestHeaders}
            title="Request Headers"
            requestCookie={capturedCookie ? undefined : record.requestCookie}
            cookieSource={capturedCookie ? undefined : record.cookieSource}
            cookieObserved={capturedCookie || requestCookie ? undefined : record.cookieObserved}
          />
        ) : (
          <HeadersTab headers={record.responseHeaders} title="Response Headers" />
        ))}

        {section === 'body' && (side === 'request' ? (
          <BodyTab
            key={record.id + '-request'}
            body={record.requestBody}
            label="Request Body"
            decryptUrl={decryptUrl}
            decryptPayload={requestBody}
            cookieHeader={requestCookie}
            autoDecrypt={autoDecrypt}
          />
        ) : (
          <BodyTab
            key={record.id + '-response'}
            body={record.responseBody}
            label="Response Body"
            decryptUrl={decryptUrl}
            decryptPayload={{ ...responseBody, key: requestBody?.key || extractQueryKey(record.url) }}
            cookieHeader={requestCookie}
            autoDecrypt={autoDecrypt}
          />
        ))}
      </div>
    </div>
  );
}
