import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { OverlayApi } from '@shared/api';
import type { OverlayPayload } from '@shared/ipc';
import './overlay.css';

const api = window.api as OverlayApi;

function Overlay() {
  const [payload, setPayload] = useState<OverlayPayload | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => api.onShow((p) => {
    setPayload(p);
    setLeft(p.seconds);
  }), []);

  useEffect(() => {
    if (!payload) return;
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [payload]);

  if (!payload) return null;
  // 클릭하면 닫힘 (닫는 시점은 메인 프로세스 타이머가 책임진다)
  return (
    <div className="overlay" onClick={() => api.close()}>
      <div className="card">
        <div className="icon">⏰</div>
        <div className="text">{payload.text}</div>
        <div className="hint">{left}초 뒤에 사라져요 · 누르면 닫혀요</div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Overlay />);
