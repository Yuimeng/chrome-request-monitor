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
