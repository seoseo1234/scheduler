import { createRoot } from 'react-dom/client';
import './identify.css';

const params = new URLSearchParams(location.hash.slice(1));
const n = params.get('n') ?? '?';
const primary = params.get('primary') === '1';

createRoot(document.getElementById('root')!).render(
  <div className="identify">
    <div className="n">{n}</div>
    <div className="label">{primary ? '주 모니터' : `${n}번 모니터`}</div>
  </div>,
);
