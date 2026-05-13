import { useState } from 'react';
import type { RequestRecord } from '@request-monitor/shared';
import GeneralTab from './GeneralTab';
import HeadersTab from './HeadersTab';
import BodyTab from './BodyTab';


interface RequestDetailProps {
  record: RequestRecord;
  decryptUrl?: string;
}

function extractQueryKey(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get('key') || undefined;
  } catch {
    return undefined;
  }
}

const TABS = [
  "Request Body",
  "Response Body",
  "General",
  "Request Headers",
  "Response Headers",
] as const;

export default function RequestDetail({ record, decryptUrl }: RequestDetailProps) {
  const [activeTab, setActiveTab] = useState<string>("Request Body");
  let requestBody, responseBody;
  try {
    requestBody = record.requestBody ? JSON.parse(record.requestBody) : {};
    responseBody = record.responseBody ? JSON.parse(record.responseBody) : {};
  } catch {
    //
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', background: '#fafafa' }}>
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
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'General' && <GeneralTab record={record} />}
        {activeTab === 'Request Headers' && <HeadersTab headers={record.requestHeaders} title="Request Headers" />}
        {activeTab === 'Response Headers' && <HeadersTab headers={record.responseHeaders} title="Response Headers" />}
        {activeTab === 'Request Body' && (
          <BodyTab
            key={record.id + '-request'}
            body={record.requestBody}
            label="Request Body"
            decryptUrl={decryptUrl}
            decryptPayload={requestBody}
          />
        )}
        {activeTab === 'Response Body' && (
          <BodyTab
            key={record.id + '-response'}
            body={record.responseBody}
            label="Response Body"
            decryptUrl={decryptUrl}
            decryptPayload={{ ...responseBody, key: requestBody.key || extractQueryKey(record.url) }}
          />
        )}
      </div>
    </div>
  );
}
