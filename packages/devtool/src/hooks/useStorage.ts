/**
 * 模块：devtool / hooks / useStorage —— chrome.storage.sync 响应式读写 Hook
 *
 * 组成：初始读取（get）+ 变更监听（onChanged）+ 写入（set）封装为 [value, update, loading]。
 * 协作：与 popup 中同名 hook 行为一致（两处独立实现），保证 popup 改配置后面板即时同步；
 *   典型用例：DECRYPT_URL（解密服务地址）、AUTO_DECRYPT（自动解密开关）。
 */
import { useState, useEffect, useCallback } from 'react';

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
