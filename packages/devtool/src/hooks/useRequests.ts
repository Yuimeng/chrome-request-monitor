/**
 * 模块：devtool / hooks / useRequests —— 请求数据源 Hook
 *
 * 组成：
 *   - Port 长连接（connect）      连接 background，接收全量回放（CAPTURED_REQUESTS_RESPONSE）、
 *     增量推送（REQUEST_CAPTURED）与清空指令（CLEAR_REQUESTS）
 *   - 断线重连（onDisconnect）     Service Worker 休眠会导致连接断开，500ms 后自动重连并重新回放
 *   - REQUESTS_EVICTED 处理       background 因超出条数上限淘汰记录时，按 id 从本地列表移除，
 *     保证面板列表与后台缓冲一致（上限在 popup 配置，默认 500 条）
 *   - clearRequests / importRequests  本地清空、导入 HAR（同时把记录同步给 background 持久化）
 *
 * 协作：App 调用本 Hook 获取 requests 列表；数据源头是 content 捕获、经 background 广播的记录。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { MESSAGE_TYPES, PORT_NAME_DEVTOOLS } from '@request-monitor/shared';
import type { RequestRecord } from '@request-monitor/shared';

export function useRequests() {
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    let disconnected = false;

    // 建立 Port 连接并注册消息/断开监听；可重复调用以实现重连
    function connect() {
      if (disconnected) return;
      const port = chrome.runtime.connect({ name: PORT_NAME_DEVTOOLS });
      portRef.current = port;

      port.onMessage.addListener((message: any) => {
        switch (message.type) {
          case MESSAGE_TYPES.CAPTURED_REQUESTS_RESPONSE:
            setRequests(message.data as RequestRecord[]);
            break;
          case MESSAGE_TYPES.REQUEST_CAPTURED:
            setRequests(prev => [...prev, message.data as RequestRecord]);
            break;
          case MESSAGE_TYPES.REQUESTS_EVICTED: {
            // 超出条数上限被后台淘汰的记录：同步移除，避免面板无限增长
            const evicted = new Set(message.ids as string[]);
            setRequests(prev => prev.filter(record => !evicted.has(record.id)));
            break;
          }
          case MESSAGE_TYPES.CLEAR_REQUESTS:
            setRequests([]);
            break;
        }
      });

      port.onDisconnect.addListener(() => {
        portRef.current = null;
        // Service worker terminated — reconnect after a brief delay
        setTimeout(connect, 500);
      });
    }

    connect();

    return () => {
      disconnected = true;
      portRef.current?.disconnect();
      portRef.current = null;
    };
  }, []);

  const clearRequests = useCallback(() => {
    setRequests([]);
  }, []);

  const importRequests = useCallback((records: RequestRecord[]) => {
    setRequests(prev => [...records, ...prev]);
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.IMPORT_REQUESTS, data: records });
  }, []);

  return { requests, clearRequests, importRequests };
}
