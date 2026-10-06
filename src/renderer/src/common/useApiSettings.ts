import { useEffect, useState } from 'react';

interface SettingsSource<T> {
  getSettings(): Promise<T>;
  onSettings(cb: (s: T) => void): () => void;
}

/** preload에서 설정을 받아오고 변경 시 즉시 갱신한다. */
export function useApiSettings<T>(api: SettingsSource<T>): T | null {
  const [settings, setSettings] = useState<T | null>(null);
  useEffect(() => {
    const off = api.onSettings(setSettings);
    void api.getSettings().then(setSettings);
    return off;
  }, [api]);
  return settings;
}
