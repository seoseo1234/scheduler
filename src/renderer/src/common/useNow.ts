import { useEffect, useState } from 'react';

/**
 * 매 초 경계에 맞춰 갱신되는 현재 시각.
 * 절전 복귀·화면 다시 보임 시 즉시 다시 계산한다.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = setTimeout(tick, 1000 - d.getMilliseconds() + 5);
    };
    const refresh = () => {
      clearTimeout(timer);
      tick();
    };
    tick();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return now;
}
