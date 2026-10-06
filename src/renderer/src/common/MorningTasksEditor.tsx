import { useState } from 'react';
import { toDateKey } from '@shared/schedule';
import type { MorningTasks, TaskItem, Weekday } from '@shared/types';
import { TaskListEditor } from './TaskListEditor';

const WEEKDAYS: { day: Weekday; label: string }[] = [
  { day: 1, label: '월' },
  { day: 2, label: '화' },
  { day: 3, label: '수' },
  { day: 4, label: '목' },
  { day: 5, label: '금' },
  { day: 6, label: '토' },
  { day: 0, label: '일' },
];

interface Props {
  value: MorningTasks;
  onChange: (next: MorningTasks) => void;
  now: Date;
}

/** 오늘만 항목: 날짜가 지난 항목은 비어 있는 것으로 본다 (다음 날 자동 삭제) */
function todayOnly(value: MorningTasks, today: string): TaskItem[] {
  return value.todayOnly.date === today ? value.todayOnly.items : [];
}

function setTodayOnly(value: MorningTasks, today: string, items: TaskItem[]): MorningTasks {
  return { ...value, todayOnly: { date: today, items } };
}

function setWeekday(value: MorningTasks, day: Weekday, items: TaskItem[] | null): MorningTasks {
  const byWeekday = { ...value.byWeekday };
  if (items === null) delete byWeekday[day];
  else byWeekday[day] = items;
  return { ...value, byWeekday };
}

/** 교사 위젯용 간단 편집: 오늘 적용되는 매일 목록 + 오늘만 목록 */
export function MorningTasksQuickEditor({ value, onChange, now }: Props) {
  const today = toDateKey(now);
  const day = now.getDay() as Weekday;
  const usesWeekday = (value.byWeekday[day]?.length ?? 0) > 0;
  const base = usesWeekday ? value.byWeekday[day]! : value.default;
  const label = WEEKDAYS.find((w) => w.day === day)?.label;

  return (
    <div className="morning-quick">
      <div className="sub-head">오늘만</div>
      <TaskListEditor
        items={todayOnly(value, today)}
        onChange={(items) => onChange(setTodayOnly(value, today, items))}
        placeholder="오늘만 할 일 추가"
      />
      <div className="sub-head">{usesWeekday ? `${label}요일 목록` : '매일 목록'}</div>
      <TaskListEditor
        items={base}
        onChange={(items) => onChange(usesWeekday ? setWeekday(value, day, items) : { ...value, default: items })}
      />
    </div>
  );
}

/** 설정 화면용 전체 편집: 기본 목록, 요일별 목록, 오늘만 목록 */
export function MorningTasksEditor({ value, onChange, now }: Props) {
  const today = toDateKey(now);
  const [day, setDay] = useState<Weekday>(() => {
    const d = now.getDay() as Weekday;
    return d === 0 || d === 6 ? 1 : d;
  });
  const custom = value.byWeekday[day] !== undefined;

  return (
    <div className="morning-editor">
      <section>
        <h3>오늘만 ({today})</h3>
        <p className="hint">오늘 날짜에만 추가로 보이고, 다음 날 자동으로 사라져요.</p>
        <TaskListEditor
          items={todayOnly(value, today)}
          onChange={(items) => onChange(setTodayOnly(value, today, items))}
          placeholder="오늘만 할 일 추가"
        />
      </section>

      <section>
        <h3>기본 목록</h3>
        <p className="hint">요일별 목록을 따로 정하지 않은 날에 매일 보여요.</p>
        <TaskListEditor items={value.default} onChange={(items) => onChange({ ...value, default: items })} />
      </section>

      <section>
        <h3>요일별 목록</h3>
        <div className="day-tabs">
          {WEEKDAYS.map((w) => (
            <button
              key={w.day}
              className={`${w.day === day ? 'active' : ''} ${value.byWeekday[w.day] ? 'has-custom' : ''}`}
              onClick={() => setDay(w.day)}
            >
              {w.label}
            </button>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={custom}
            onChange={(e) => onChange(setWeekday(value, day, e.target.checked ? [...value.default] : null))}
          />
          {WEEKDAYS.find((w) => w.day === day)?.label}요일은 따로 정하기
        </label>
        {custom ? (
          <TaskListEditor items={value.byWeekday[day]!} onChange={(items) => onChange(setWeekday(value, day, items))} />
        ) : (
          <p className="hint">기본 목록을 사용해요.</p>
        )}
      </section>
    </div>
  );
}
