/**
 * 模块：popup / hooks / useStorage —— chrome.storage.sync 响应式读写 Hook
 *
 * 组成：初始 get + onChanged 监听 + set，返回 [value, update, loading]。
 * 协作：与 devtool 中同名 hook 行为一致（两处独立实现）；update 即写入，
 *   其他监听该键的上下文（content、其他 UI）会自动收到变更。
 */
import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '@request-monitor/shared';

export function useStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.storage.sync.get(key, (result) => {
      if (result[key] !== undefined) {
        setValue(result[key] as T);
      }
      setLoading(false);
    });

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (key in changes) {
        setValue(changes[key].newValue as T);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key]);

  const update = useCallback((newValue: T) => {
    chrome.storage.sync.set({ [key]: newValue });
  }, [key]);

  return [value, update, loading] as const;
}
