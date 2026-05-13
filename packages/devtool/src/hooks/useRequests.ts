import { useState, useEffect, useRef, useCallback } from 'react';
import { MESSAGE_TYPES, PORT_NAME_DEVTOOLS } from '@request-monitor/shared';
import type { RequestRecord } from '@request-monitor/shared';

export function useRequests() {
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    let disconnected = false;

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

  return { requests, clearRequests };
}
