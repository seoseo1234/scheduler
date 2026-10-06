import { Fragment, useMemo, useState } from 'react';
import { parseHHmm, validateBlocks, type BlockError } from '@shared/schedule';
import { NO_SCHOOL, type Block, type BlockKind, type ScheduleTemplate, type Settings, type Weekday } from '@shared/types';
import { newId } from '../common/id';
import { SaveBar } from './SaveBar';
import { useDraft } from './useDraft';

const KINDS: { value: BlockKind; label: string }[] = [
  { value: 'morning', label: '아침시간' },
  { value: 'class', label: '수업' },
  { value: 'break', label: '쉬는시간' },
  { value: 'lunch', label: '점심시간' },
  { value: 'other', label: '기타' },
];

export const WEEKDAY_ROWS: { day: Weekday; label: string }[] = [
  { day: 1, label: '월요일' },
  { day: 2, label: '화요일' },
  { day: 3, label: '수요일' },
  { day: 4, label: '목요일' },
  { day: 5, label: '금요일' },
  { day: 6, label: '토요일' },
  { day: 0, label: '일요일' },
];

type Draft = Pick<Settings, 'templates' | 'weekdayTemplate' | 'dateOverrides'>;

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
}

function addMinutes(hhmm: string, minutes: number): string {
  const total = Math.min(parseHHmm(hhmm) + minutes, 23 * 60 + 59);
  if (Number.isNaN(total)) return '';
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function ScheduleTab({ settings, update }: Props) {
  const source = useMemo<Draft>(
    () => ({ templates: settings.templates, weekdayTemplate: settings.weekdayTemplate, dateOverrides: settings.dateOverrides }),
    [settings.templates, settings.weekdayTemplate, settings.dateOverrides],
  );
  const { draft, setDraft, dirty, revert } = useDraft(source);
  const [selectedId, setSelectedId] = useState<string | undefined>(draft.templates[0]?.id);
  const selected = draft.templates.find((t) => t.id === selectedId) ?? draft.templates[0];

  // 모든 템플릿의 오류 (선택하지 않은 템플릿 오류도 저장을 막는다)
  const errorsByTemplate = useMemo(
    () => Object.fromEntries(draft.templates.map((t) => [t.id, validateBlocks(t.blocks)])),
    [draft.templates],
  );
  const invalidTemplate = draft.templates.find((t) => errorsByTemplate[t.id].length > 0 || !t.name.trim());
  const blockedReason = invalidTemplate ? `"${invalidTemplate.name || '이름 없음'}" 시정표에 오류가 있어 저장할 수 없어요.` : null;

  const setTemplate = (id: string, fn: (t: ScheduleTemplate) => ScheduleTemplate) =>
    setDraft((d) => ({ ...d, templates: d.templates.map((t) => (t.id === id ? fn(t) : t)) }));

  const addTemplate = (copy: boolean) => {
    const id = newId('tpl');
    const base: ScheduleTemplate = copy && selected
      ? { id, name: `${selected.name} 복사본`, blocks: selected.blocks.map((b) => ({ ...b, id: newId('b') })) }
      : { id, name: '새 시정', blocks: [] };
    setDraft((d) => ({ ...d, templates: [...d.templates, base] }));
    setSelectedId(id);
  };

  const deleteTemplate = (id: string) => {
    if (draft.templates.length <= 1) return;
    const name = draft.templates.find((t) => t.id === id)?.name;
    if (!confirm(`"${name}" 시정표를 삭제할까요? 이 시정을 쓰던 요일·날짜는 "사용 안 함"으로 바뀌어요.`)) return;
    setDraft((d) => ({
      templates: d.templates.filter((t) => t.id !== id),
      weekdayTemplate: Object.fromEntries(
        Object.entries(d.weekdayTemplate).map(([k, v]) => [k, v === id ? null : v]),
      ) as Draft['weekdayTemplate'],
      dateOverrides: Object.fromEntries(Object.entries(d.dateOverrides).filter(([, v]) => v !== id)),
    }));
    setSelectedId(draft.templates.find((t) => t.id !== id)?.id);
  };

  const save = () => void update(draft);

  return (
    <section className="schedule-tab">
      <h2>시정표</h2>

      <div className="template-bar">
        <select value={selected?.id} onChange={(e) => setSelectedId(e.target.value)}>
          {draft.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name || '(이름 없음)'}
              {errorsByTemplate[t.id].length > 0 ? ' ⚠' : ''}
            </option>
          ))}
        </select>
        <button onClick={() => addTemplate(false)}>새 템플릿</button>
        <button onClick={() => addTemplate(true)}>복사해서 만들기</button>
        <button className="danger" disabled={draft.templates.length <= 1} onClick={() => selected && deleteTemplate(selected.id)}>
          삭제
        </button>
      </div>

      {selected && (
        <TemplateEditor
          template={selected}
          errors={errorsByTemplate[selected.id]}
          onChange={(fn) => setTemplate(selected.id, fn)}
        />
      )}

      <h3>요일별 시정</h3>
      <div className="weekday-grid">
        {WEEKDAY_ROWS.map(({ day, label }) => (
          <label key={day}>
            {label}
            <select
              value={draft.weekdayTemplate[day] ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, weekdayTemplate: { ...d.weekdayTemplate, [day]: e.target.value || null } }))
              }
            >
              <option value="">사용 안 함</option>
              {draft.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <h3>날짜 예외</h3>
      <p className="hint">방학·공휴일·재량휴업은 "수업 없음", 단축 수업 날은 다른 시정을 고르세요.</p>
      <DateOverrides draft={draft} setDraft={setDraft} />

      <SaveBar dirty={dirty} onSave={save} onRevert={revert} blockedReason={blockedReason} />
    </section>
  );
}

function TemplateEditor(props: {
  template: ScheduleTemplate;
  errors: BlockError[];
  onChange: (fn: (t: ScheduleTemplate) => ScheduleTemplate) => void;
}) {
  const { template, errors, onChange } = props;
  const setBlocks = (fn: (blocks: Block[]) => Block[]) => onChange((t) => ({ ...t, blocks: fn(t.blocks) }));
  const patch = (i: number, p: Partial<Block>) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const move = (i: number, d: -1 | 1) =>
    setBlocks((bs) => {
      const j = i + d;
      if (j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const addRow = () =>
    setBlocks((bs) => {
      const last = bs[bs.length - 1];
      const start = last ? last.end : '09:00';
      const classCount = bs.filter((b) => b.kind === 'class').length;
      return [...bs, { id: newId('b'), name: `${classCount + 1}교시`, kind: 'class', start, end: addMinutes(start, 40) }];
    });
  const sortByTime = () => setBlocks((bs) => [...bs].sort((a, b) => parseHHmm(a.start) - parseHHmm(b.start)));

  const rowErrors = (i: number) => errors.filter((e) => e.index === i);

  return (
    <div className="template-editor">
      <label className="inline">
        템플릿 이름
        <input value={template.name} onChange={(e) => onChange((t) => ({ ...t, name: e.target.value }))} />
      </label>
      <table className="blocks">
        <thead>
          <tr>
            <th>#</th>
            <th>이름</th>
            <th>종류</th>
            <th>시작</th>
            <th>종료</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {template.blocks.map((b, i) => {
            const errs = rowErrors(i);
            const has = (codes: string[]) => errs.some((e) => codes.includes(e.code));
            return (
              <Fragment key={b.id}>
              <tr className={errs.length ? 'row-error' : ''}>
                <td className="num">{i + 1}</td>
                <td>
                  <input className={has(['emptyName']) ? 'bad' : ''} value={b.name} onChange={(e) => patch(i, { name: e.target.value })} />
                </td>
                <td>
                  <select value={b.kind} onChange={(e) => patch(i, { kind: e.target.value as BlockKind })}>
                    {KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="time"
                    className={has(['invalidStart', 'startNotBeforeEnd', 'overlap']) ? 'bad' : ''}
                    value={b.start}
                    onChange={(e) => patch(i, { start: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className={has(['invalidEnd', 'startNotBeforeEnd', 'overlap']) ? 'bad' : ''}
                    value={b.end}
                    onChange={(e) => patch(i, { end: e.target.value })}
                  />
                </td>
                <td className="row-actions">
                  <button title="위로" disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button title="아래로" disabled={i === template.blocks.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                  <button title="삭제" onClick={() => setBlocks((bs) => bs.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </td>
              </tr>
              {errs.length > 0 && (
                <tr className="error-msg">
                  <td />
                  <td colSpan={5}>{[...new Set(errs.map((e) => e.message))].join(' ')}</td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="row">
        <button onClick={addRow}>행 추가</button>
        <button onClick={sortByTime}>시간순 정렬</button>
        {template.blocks.length === 0 && <span className="hint">구간을 추가하세요.</span>}
      </div>
    </div>
  );
}

function DateOverrides({ draft, setDraft }: { draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void }) {
  const [date, setDate] = useState('');
  const [value, setValue] = useState<string>(NO_SCHOOL);
  const entries = Object.entries(draft.dateOverrides).sort(([a], [b]) => a.localeCompare(b));
  const name = (v: string) => (v === NO_SCHOOL ? '수업 없음' : (draft.templates.find((t) => t.id === v)?.name ?? '(삭제된 시정)'));

  const set = (d: string, v: string | null) =>
    setDraft((s) => {
      const next = { ...s.dateOverrides };
      if (v === null) delete next[d];
      else next[d] = v;
      return { ...s, dateOverrides: next };
    });

  return (
    <div className="overrides">
      <div className="row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select value={value} onChange={(e) => setValue(e.target.value)}>
          <option value={NO_SCHOOL}>수업 없음</option>
          {draft.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          disabled={!date}
          onClick={() => {
            set(date, value);
            setDate('');
          }}
        >
          추가
        </button>
      </div>
      {entries.length > 0 && (
        <ul className="override-list">
          {entries.map(([d, v]) => (
            <li key={d}>
              <span className="date">{formatDateKo(d)}</span>
              <span>{name(v)}</span>
              <button title="삭제" onClick={() => set(d, null)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
export function formatDateKo(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${y}. ${m}. ${d}. (${WEEKDAY_KO[date.getDay()]})`;
}
