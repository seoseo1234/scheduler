import { useMemo, useState } from 'react';
import { parseHHmm, resolveTemplate } from '@shared/schedule';
import type { Settings, Weekday } from '@shared/types';
import { SaveBar } from './SaveBar';
import { formatDateKo, WEEKDAY_ROWS } from './ScheduleTab';
import { useDraft } from './useDraft';

type Draft = Pick<Settings, 'weeklySubjects' | 'subjectNotes' | 'subjectOverrides'>;

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
}

/** 모든 시정 템플릿의 수업 구간 이름을 시작 시각 순으로 모은다. */
function classNames(settings: Settings): string[] {
  const first = new Map<string, number>();
  for (const t of settings.templates)
    for (const b of t.blocks)
      if (b.kind === 'class' && !first.has(b.name)) first.set(b.name, parseHHmm(b.start));
  return [...first.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
}

function setIn<T>(rec: Record<string, Record<string, T>>, key: string, inner: string, value: T | null) {
  const row = { ...(rec[key] ?? {}) };
  if (value === null) delete row[inner];
  else row[inner] = value;
  const next = { ...rec, [key]: row };
  if (Object.keys(row).length === 0) delete next[key];
  return next;
}

export function SubjectsTab({ settings, update }: Props) {
  const source = useMemo<Draft>(
    () => ({
      weeklySubjects: settings.weeklySubjects,
      subjectNotes: settings.subjectNotes,
      subjectOverrides: settings.subjectOverrides,
    }),
    [settings.weeklySubjects, settings.subjectNotes, settings.subjectOverrides],
  );
  const { draft, setDraft, dirty, revert } = useDraft(source);
  const periods = classNames(settings);
  // 시정이 지정된 요일만 열로 보여준다 (월~금은 항상)
  const days = WEEKDAY_ROWS.filter(({ day }) => (day >= 1 && day <= 5) || settings.weekdayTemplate[day]);

  const setSubject = (day: Weekday, period: string, value: string) =>
    setDraft((d) => ({
      ...d,
      weeklySubjects: setIn(d.weeklySubjects as Record<string, Record<string, string>>, String(day), period, value.trim() ? value : null),
    }));

  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const row of Object.values(draft.weeklySubjects)) for (const v of Object.values(row ?? {})) if (v.trim()) set.add(v.trim());
    for (const row of Object.values(draft.subjectOverrides)) for (const v of Object.values(row)) if (v.trim()) set.add(v.trim());
    for (const k of Object.keys(draft.subjectNotes)) set.add(k);
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [draft]);

  return (
    <section className="subjects-tab">
      <h2>시간표</h2>
      {periods.length === 0 ? (
        <p className="hint">시정표에 "수업" 구간이 없어요. 시정표 탭에서 먼저 교시를 만들어 주세요.</p>
      ) : (
        <table className="timetable-grid">
          <thead>
            <tr>
              <th />
              {days.map((d) => (
                <th key={d.day}>{d.label.slice(0, 1)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p}>
                <th>{p}</th>
                {days.map(({ day }) => (
                  <td key={day}>
                    <input
                      value={draft.weeklySubjects[day]?.[p] ?? ''}
                      onChange={(e) => setSubject(day, p, e.target.value)}
                      list="subject-names"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <datalist id="subject-names">
        {subjects.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <p className="hint">과목을 비워 두면 학생 화면에 교시 이름만 보여요.</p>

      <h3>과목별 준비물·안내</h3>
      <p className="hint">알림 문구의 {'{준비물}'} 자리에 들어가요. 예: 체육 → "체육복 입고 운동장으로 가요."</p>
      {subjects.length === 0 ? (
        <p className="hint">시간표에 과목을 입력하면 여기에 나타나요.</p>
      ) : (
        <div className="notes-grid">
          {subjects.map((s) => (
            <label key={s}>
              <span className="subject">{s}</span>
              <input
                value={draft.subjectNotes[s] ?? ''}
                placeholder="(없음)"
                onChange={(e) =>
                  setDraft((d) => {
                    const notes = { ...d.subjectNotes };
                    if (e.target.value.trim()) notes[s] = e.target.value;
                    else delete notes[s];
                    return { ...d, subjectNotes: notes };
                  })
                }
              />
            </label>
          ))}
        </div>
      )}

      <h3>날짜별 과목 변경</h3>
      <p className="hint">그날만 과목을 바꿔요. 예: 10월 7일 3교시 → 현장체험학습</p>
      <SubjectOverrides settings={settings} draft={draft} setDraft={setDraft} />

      <SaveBar dirty={dirty} onSave={() => void update(draft)} onRevert={revert} />
    </section>
  );
}

function SubjectOverrides(props: { settings: Settings; draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void }) {
  const { settings, draft, setDraft } = props;
  const [date, setDate] = useState('');
  const dates = Object.keys(draft.subjectOverrides).sort();

  const editDate = date || null;
  const dateObj = editDate ? new Date(`${editDate}T00:00:00`) : null;
  const template = dateObj ? resolveTemplate(settings, dateObj).template : null;
  const blocks = template?.blocks.filter((b) => b.kind === 'class') ?? [];
  const regular = (period: string) =>
    dateObj ? (draft.weeklySubjects[dateObj.getDay() as Weekday]?.[period] ?? '') : '';

  const set = (d: string, period: string, value: string) =>
    setDraft((s) => ({ ...s, subjectOverrides: setIn(s.subjectOverrides, d, period, value.trim() ? value : null) }));

  return (
    <div className="overrides">
      <div className="row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {editDate && !template && <span className="hint">이 날은 수업이 없는 날이에요.</span>}
      </div>
      {editDate && blocks.length > 0 && (
        <div className="notes-grid">
          {blocks.map((b) => (
            <label key={b.id}>
              <span className="subject">{b.name}</span>
              <input
                value={draft.subjectOverrides[editDate]?.[b.name] ?? ''}
                placeholder={regular(b.name) || '(평소 과목 없음)'}
                list="subject-names"
                onChange={(e) => set(editDate, b.name, e.target.value)}
              />
            </label>
          ))}
        </div>
      )}
      {dates.length > 0 && (
        <ul className="override-list">
          {dates.map((d) => (
            <li key={d}>
              <button className="link" onClick={() => setDate(d)}>
                {formatDateKo(d)}
              </button>
              <span>
                {Object.entries(draft.subjectOverrides[d])
                  .map(([p, v]) => `${p} ${v}`)
                  .join(', ')}
              </span>
              <button
                title="삭제"
                onClick={() =>
                  setDraft((s) => {
                    const next = { ...s.subjectOverrides };
                    delete next[d];
                    return { ...s, subjectOverrides: next };
                  })
                }
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
