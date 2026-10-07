import type { CSSProperties, ReactNode } from 'react';
import type { FontScale, MonitorInfo, Settings, WidgetDisplay, WidgetRole } from '@shared/types';
import kidsArt from '../assets/kids.webp';
import teacherArt from '../assets/teacher.webp';
import { Icon, type IconName } from './icons';

interface Props {
  settings: Settings;
  monitors: MonitorInfo[];
  update: (patch: Partial<Settings>) => Promise<void>;
  identify: () => void;
}

const FONT_OPTIONS: { value: FontScale; label: string }[] = [
  { value: 'small', label: '작게' },
  { value: 'normal', label: '보통' },
  { value: 'large', label: '크게' },
  { value: 'xlarge', label: '아주 크게' },
];

export function DisplayTab({ settings, monitors, update, identify }: Props) {
  const setWidget = (role: WidgetRole, patch: Partial<WidgetDisplay>) =>
    void update({ display: { ...settings.display, [role]: { ...settings.display[role], ...patch } } });

  const { student, teacher } = settings.display;
  const sameMonitor = student.monitorId === teacher.monitorId && monitors.length > 1;
  const teacherMissing = monitors.length > 0 && !monitors.some((m) => m.id === teacher.monitorId);

  return (
    <section>
      <h2>화면</h2>
      <div className="identify-bar">
        <button onClick={identify}>
          <Icon name="monitor" />
          모니터 확인
        </button>
        <span>각 모니터에 번호가 3초 동안 크게 표시돼요.</span>
      </div>
      {sameMonitor && (
        <div className="warn">학생 위젯과 교사 위젯이 같은 모니터에 있어요. 교사 일정이 학생에게 보일 수 있어요.</div>
      )}
      {teacherMissing && (
        <div className="warn">교사 모니터를 찾을 수 없어 교사 위젯을 숨겼어요. 교사 모니터를 다시 지정하세요.</div>
      )}

      <div className="widgets">
        <WidgetCard role="student" cfg={student} monitors={monitors} onChange={setWidget} />
        <WidgetCard role="teacher" cfg={teacher} monitors={monitors} onChange={setWidget} />
      </div>
    </section>
  );
}

const CARD_HEAD: Record<WidgetRole, { title: string; desc: string; art: string }> = {
  student: { title: '학생 위젯', desc: '교실 앞 모니터에 보여줄 설정이에요.', art: kidsArt },
  teacher: { title: '교사 위젯', desc: '선생님 모니터에 보여줄 설정이에요.', art: teacherArt },
};

function FieldLabel({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span className="field-label">
      <Icon name={icon} />
      {children}
    </span>
  );
}

function WidgetCard(props: {
  role: WidgetRole;
  cfg: WidgetDisplay;
  monitors: MonitorInfo[];
  onChange: (role: WidgetRole, patch: Partial<WidgetDisplay>) => void;
}) {
  const { role, cfg, monitors, onChange } = props;
  const set = (patch: Partial<WidgetDisplay>) => onChange(role, patch);
  const missing = !monitors.some((m) => m.id === cfg.monitorId);
  const head = CARD_HEAD[role];

  return (
    <div className={`widget-card ${role}`}>
      <header>
        <div>
          <h3>
            {role === 'student' && <Icon name="monitor" />}
            {head.title}
          </h3>
          <p>{head.desc}</p>
        </div>
        <img src={head.art} alt="" />
      </header>
      <div className="widget-card-body">
        <label>
          <FieldLabel icon="monitor">모니터</FieldLabel>
          <select value={missing ? '' : cfg.monitorId} onChange={(e) => set({ monitorId: e.target.value })}>
            {missing && <option value="">(연결 안 됨)</option>}
            {monitors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <FieldLabel icon="layers">표시 레이어</FieldLabel>
          <select value={cfg.layer} onChange={(e) => set({ layer: e.target.value as WidgetDisplay['layer'] })}>
            <option value="alwaysOnTop">항상 위</option>
            <option value="desktop">바탕화면 고정</option>
            <option value="bottom">항상 아래 (호환 모드)</option>
          </select>
        </label>
        {cfg.layer === 'desktop' && (
          <p className="info-box">
            <Icon name="info" />
            <span>위치를 잠그면 바탕화면에 붙어 '바탕화면 보기'(Win+D)에도 남아요. 잠금을 풀면 옮기거나 크기를 바꿀 수 있어요.</span>
          </p>
        )}
        <label>
          <FieldLabel icon="opacity">불투명도 {Math.round(cfg.opacity * 100)}%</FieldLabel>
          <input
            type="range"
            min={30}
            max={100}
            step={5}
            value={Math.round(cfg.opacity * 100)}
            style={{ '--fill': `${((cfg.opacity * 100 - 30) / 70) * 100}%` } as CSSProperties}
            onChange={(e) => set({ opacity: Number(e.target.value) / 100 })}
          />
        </label>
        <label>
          <FieldLabel icon="text">글자 크기</FieldLabel>
          <select value={cfg.fontScale} onChange={(e) => set({ fontScale: e.target.value as FontScale })}>
            {FONT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <FieldLabel icon="palette">테마</FieldLabel>
          <select value={cfg.theme} onChange={(e) => set({ theme: e.target.value as WidgetDisplay['theme'] })}>
            <option value="light">밝게</option>
            <option value="dark">어둡게</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={cfg.locked} onChange={(e) => set({ locked: e.target.checked })} />
          <Icon name="lock" />
          위치 잠금
        </label>
      </div>
    </div>
  );
}
