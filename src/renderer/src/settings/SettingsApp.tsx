import { useEffect, useState } from 'react';
import type { SettingsApi } from '@shared/api';
import type { MonitorInfo, Settings } from '@shared/types';
import { MorningTasksEditor } from '../common/MorningTasksEditor';
import { useNow } from '../common/useNow';
import { AlertsTab } from './AlertsTab';
import { DisplayTab } from './DisplayTab';
import { GeneralTab } from './GeneralTab';
import { GoogleTab } from './GoogleTab';
import { ScheduleTab } from './ScheduleTab';
import { SubjectsTab } from './SubjectsTab';

const TABS = [
  { id: 'display', label: '화면' },
  { id: 'schedule', label: '시정표' },
  { id: 'subjects', label: '시간표' },
  { id: 'morning', label: '아침 할 일' },
  { id: 'alerts', label: '알림' },
  { id: 'google', label: '구글 연동' },
  { id: 'general', label: '일반' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function SettingsApp({ api }: { api: SettingsApi }) {
  const [tab, setTab] = useState<TabId>('display');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  useEffect(() => {
    const offs = [api.onSettings(setSettings), api.onMonitors(setMonitors)];
    void api.get().then(setSettings);
    void api.listMonitors().then(setMonitors);
    return () => offs.forEach((off) => off());
  }, [api]);

  const update = async (patch: Partial<Settings>) => {
    const res = await api.update(patch);
    if (res.ok) {
      setSettings(res.settings);
      setError(null);
    } else setError(res.message);
  };

  if (!settings) return null;
  return (
    <div className="settings">
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? 'active' : ''}
            onClick={() => {
              setTab(t.id);
              setError(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main className="panel">
        {error && <div className="error">{error}</div>}
        {tab === 'display' && (
          <DisplayTab settings={settings} monitors={monitors} update={update} identify={() => void api.identifyMonitors()} />
        )}
        {tab === 'schedule' && <ScheduleTab settings={settings} update={update} />}
        {tab === 'subjects' && <SubjectsTab settings={settings} update={update} />}
        {tab === 'morning' && (
          <section>
            <h2>아침 할 일</h2>
            <p className="hint">고치면 바로 저장되고 학생 화면에 반영돼요. 교사 위젯에서도 바로 고칠 수 있어요.</p>
            <MorningTasksEditor value={settings.morningTasks} now={now} onChange={(morningTasks) => void update({ morningTasks })} />
          </section>
        )}
        {tab === 'alerts' && <AlertsTab api={api} settings={settings} update={update} />}
        {tab === 'general' && <GeneralTab api={api} settings={settings} update={update} onSettings={setSettings} />}
        {tab === 'google' && <GoogleTab api={api} settings={settings} update={update} />}
      </main>
    </div>
  );
}
