import { useEffect, useState, type ReactNode } from 'react';
import type { TeacherApi } from '@shared/api';
import {
  buildEventView,
  eventEnd,
  eventStart,
  eventsStartingSoon,
  groupTasks,
  TASK_BUCKET_LABEL,
  type TodayEvent,
} from '@shared/google';
import { formatKoreanDate, formatKoreanTime, isPaused, remainingMinutes } from '@shared/schedule';
import type { TaskAction } from '@shared/ipc';
import type { AlertSettings, GoogleEvent, GoogleSnapshot, GoogleStatus, GoogleTask, TeacherSettings } from '@shared/types';
import { MorningTasksQuickEditor } from '../common/MorningTasksEditor';
import { useApiSettings } from '../common/useApiSettings';
import { useNow } from '../common/useNow';
import { useWidgetDisplay } from '../common/widget';
import { WidgetMenu } from '../common/WidgetMenu';

export function TeacherWidget({ api }: { api: TeacherApi }) {
  const settings = useApiSettings(api);
  const now = useNow();
  const [hidden, setHidden] = useState(false);
  const [google, setGoogle] = useState<GoogleSnapshot | null>(null);
  useWidgetDisplay(settings?.display.teacher);

  useEffect(() => {
    const offs = [api.onGoogle(setGoogle), api.onToggleCover(() => setHidden((h) => !h))];
    void api.getGoogle().then(setGoogle);
    return () => offs.forEach((off) => off());
  }, [api]);

  if (!settings) return <div className="teacher drag" />;

  return (
    <div className="teacher">
      <header className="bar drag">
        <div>
          <div className="title">{formatKoreanTime(now)}</div>
          <div className="sub">{formatKoreanDate(now)}</div>
        </div>
        <div className="actions">
          <button
            onClick={() => setHidden((h) => !h)}
            title={`교사 위젯 내용 가리기${settings.teacherHideShortcut ? ` (${settings.teacherHideShortcut})` : ''}`}
          >
            {hidden ? '보이기' : '가리기'}
          </button>
          <button onClick={() => void api.openSettings()} title="설정 열기">
            ⚙
          </button>
        </div>
      </header>
      {hidden ? (
        <div className="cover">가려져 있어요</div>
      ) : (
        <div className="sections">
          {google && <SyncLine status={google.status} onRefresh={() => void api.refreshGoogle()} />}
          {google?.data && (
            <Reminders events={google.data.events} now={now} minutes={settings.google.eventReminderMinutes} />
          )}
          <AlertControls api={api} alerts={settings.alerts} now={now} />
          <Section id="events" title="오늘 일정">
            <Events snapshot={google} settings={settings} now={now} onOpenSettings={() => void api.openSettings()} />
          </Section>
          <Section id="tasks" title="할 일">
            <Tasks api={api} snapshot={google} settings={settings} now={now} />
          </Section>
          <Section id="morning" title="아침 할 일">
            <MorningTasksQuickEditor
              value={settings.morningTasks}
              now={now}
              onChange={(next) => void api.updateMorningTasks(next)}
            />
          </Section>
        </div>
      )}
      <WidgetMenu api={api} name="교사" />
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const key = `section-open:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== '0';
    } catch {
      return true;
    }
  });
  const toggle = () =>
    setOpen((o) => {
      try {
        localStorage.setItem(key, o ? '0' : '1');
      } catch {
        // 저장 실패해도 동작에는 문제 없음
      }
      return !o;
    });
  return (
    <section className="section">
      <button className="section-head" onClick={toggle}>
        <span className="chevron">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

function SyncLine({ status, onRefresh }: { status: GoogleStatus; onRefresh: () => void }) {
  if (status.state === 'notConfigured') return null;
  const last = status.lastSync ? formatKoreanTime(new Date(status.lastSync)) : null;
  let text: string;
  switch (status.state) {
    case 'loading':
      text = '동기화 중…';
      break;
    case 'ok':
      text = `마지막 동기화 ${last}`;
      break;
    case 'offline':
      text = last ? `오프라인 · ${last} 기준` : '오프라인';
      break;
    default:
      text = last ? `동기화 실패 · ${last} 기준` : '동기화 실패';
  }
  return (
    <div className={`sync-line state-${status.state}`} title={status.message ?? undefined}>
      <span>{text}</span>
      <button onClick={onRefresh} disabled={status.state === 'loading'} title="지금 새로고침">
        ⟳
      </button>
    </div>
  );
}

/** 일정 시작 N분 전 알림 (교사 모니터에만) */
function Reminders({ events, now, minutes }: { events: GoogleEvent[]; now: Date; minutes: number }) {
  const soon = eventsStartingSoon(events, now, minutes);
  if (soon.length === 0) return null;
  return (
    <div className="reminders">
      {soon.map((e) => (
        <div key={e.id} className="reminder">
          ⏰ {remainingMinutes(eventStart(e).getTime() - now.getTime())}분 뒤 <b>{e.title}</b>
          {e.location && ` · ${e.location}`}
        </div>
      ))}
    </div>
  );
}

/** "오후 3:00–4:00" (오전/오후가 같으면 한 번만) */
function timeRange(e: GoogleEvent): string {
  const [p1, t1] = formatKoreanTime(eventStart(e)).split(' ');
  const [p2, t2] = formatKoreanTime(eventEnd(e)).split(' ');
  return p1 === p2 ? `${p1} ${t1}–${t2}` : `${p1} ${t1}–${p2} ${t2}`;
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
function dayLabel(key: string, now: Date): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  const rel = diff === 1 ? '내일 · ' : diff === 2 ? '모레 · ' : '';
  return `${rel}${m}월 ${d}일 (${WEEKDAY_KO[date.getDay()]})`;
}

function Events(props: { snapshot: GoogleSnapshot | null; settings: TeacherSettings; now: Date; onOpenSettings: () => void }) {
  const { snapshot, settings, now, onOpenSettings } = props;
  if (!snapshot?.data) {
    if (!snapshot || snapshot.status.state === 'notConfigured')
      return (
        <p className="placeholder">
          구글 캘린더가 연결되지 않았어요.{' '}
          <button className="link" onClick={onOpenSettings}>
            연결하기
          </button>
        </p>
      );
    return <p className="placeholder">{snapshot.status.message ?? '일정을 불러오는 중이에요.'}</p>;
  }
  const view = buildEventView(snapshot.data.events, now, settings.google.days);
  const empty = view.todayAllDay.length === 0 && view.todayTimed.length === 0;
  return (
    <>
      {view.todayAllDay.length > 0 && (
        <div className="all-day">
          {view.todayAllDay.map((e) => (
            <span key={e.id} className="chip" title={e.calendar}>
              {e.title}
            </span>
          ))}
        </div>
      )}
      {empty ? (
        <p className="placeholder empty-day">오늘 일정이 없어요. ☀️</p>
      ) : (
        <ul className="events">
          {view.todayTimed.map((t: TodayEvent) => (
            <li key={t.event.id} className={t.timing}>
              <span className="time">{timeRange(t.event)}</span>
              <span className="what">
                {t.event.title}
                {t.event.location && <span className="loc"> · {t.event.location}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {view.upcoming.length > 0 && (
        <div className="upcoming">
          <div className="sub-head">다가오는 일정</div>
          {view.upcoming.map((g) => (
            <div key={g.date} className="day">
              <div className="day-label">{dayLabel(g.date, now)}</div>
              <ul className="events">
                {g.allDay.map((e) => (
                  <li key={e.id}>
                    <span className="tag all-day-tag">종일</span>
                    <span className="what">{e.title}</span>
                  </li>
                ))}
                {g.timed.map((e) => (
                  <li key={e.id}>
                    <span className="tag">{formatKoreanTime(eventStart(e))}</span>
                    <span className="what">
                      {e.title}
                      {e.location && <span className="loc"> · {e.location}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Tasks(props: { api: TeacherApi; snapshot: GoogleSnapshot | null; settings: TeacherSettings; now: Date }) {
  const { api, snapshot, settings, now } = props;
  if (!snapshot?.data) return <p className="placeholder">구글 태스크가 연결되지 않았어요.</p>;
  const groups = groupTasks(snapshot.data.tasks, now, settings.google.lists);
  if (groups.length === 0) return <p className="placeholder">남은 할 일이 없어요. 🎉</p>;
  const multipleLists = new Set(snapshot.data.tasks.map((t) => t.list)).size > 1;
  // 예전 Apps Script 코드는 목록 ID를 보내지 않아 할 일을 바꿀 수 없다.
  const editable = snapshot.data.tasks.some((t) => t.listId);
  return (
    <div className="tasks">
      {!editable && (
        <p className="placeholder small">
          여기서 할 일을 완료·수정·삭제하려면 설정 → 구글 연동에서 Apps Script 코드를 다시 붙여넣고 새 버전으로 배포하세요.
        </p>
      )}
      {groups.map((g) => (
        <div key={g.bucket} className={`bucket bucket-${g.bucket}`}>
          <div className="sub-head">{TASK_BUCKET_LABEL[g.bucket]}</div>
          <ul>
            {g.tasks.map((t) => (
              <TaskRow key={`${t.list}|${t.id}`} api={api} task={t} showDue={g.bucket !== 'today'} showList={multipleLists} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** 할 일 한 줄: 동그라미를 누르면 완료, ✎ 수정, ✕ 삭제 */
function TaskRow(props: { api: TeacherApi; task: GoogleTask; showDue: boolean; showList: boolean }) {
  const { api, task, showDue, showList } = props;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(task.due ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { listId: task.listId, taskId: task.id };
  const canEdit = !!task.listId;

  const run = async (action: TaskAction) => {
    setBusy(true);
    setError(null);
    const res = await api.taskAction(action);
    setBusy(false);
    if (!res.ok) setError(res.message);
    return res.ok;
  };
  const save = async () => {
    if (await run({ action: 'update', ...ids, title, due: due || null, notes: task.notes })) setEditing(false);
  };
  const startEdit = () => {
    setTitle(task.title);
    setDue(task.due ?? '');
    setError(null);
    setEditing(true);
  };

  if (editing) {
    return (
      <li className="task-edit">
        <input
          className="task-title-input"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && title.trim()) void save();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
        <div className="task-edit-row">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} title="마감일 (비우면 없음)" />
          <button className="save" disabled={busy || !title.trim()} onClick={() => void save()}>
            저장
          </button>
          <button disabled={busy} onClick={() => setEditing(false)}>
            취소
          </button>
        </div>
        {error && <span className="task-error">{error}</span>}
      </li>
    );
  }

  return (
    <li className={busy ? 'busy' : undefined} title={task.notes || undefined}>
      <button
        className="task-check"
        title={canEdit ? '완료로 표시' : undefined}
        aria-label="완료로 표시"
        disabled={!canEdit || busy}
        onClick={() => void run({ action: 'complete', ...ids })}
      />
      <span className="what">{task.title}</span>
      {task.due && showDue && (
        <span className="due">
          {Number(task.due.slice(5, 7))}/{Number(task.due.slice(8, 10))}
        </span>
      )}
      {showList && <span className="list">{task.list}</span>}
      {canEdit && (
        <span className="task-tools">
          <button title="수정" disabled={busy} onClick={startEdit}>
            ✎
          </button>
          <button
            title="삭제"
            disabled={busy}
            onClick={() => {
              if (confirm(`"${task.title}" 할 일을 구글 태스크에서 삭제할까요?`)) void run({ action: 'delete', ...ids });
            }}
          >
            ✕
          </button>
        </span>
      )}
      {error && <span className="task-error">{error}</span>}
    </li>
  );
}

/** 수업 알림 상태와 일시정지 버튼 (시험·행사 때 사용) */
function AlertControls({ api, alerts, now }: { api: TeacherApi; alerts: AlertSettings; now: Date }) {
  const paused = isPaused(alerts, now);
  let status = '수업 알림 켜짐';
  if (paused && alerts.pausedUntil) {
    const until = new Date(alerts.pausedUntil);
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const untilTomorrow = until.getTime() === tomorrow.getTime();
    status = untilTomorrow ? '오늘 알림 꺼짐 (내일 다시 켜져요)' : `${formatKoreanTime(until)}까지 알림 꺼짐`;
  }
  return (
    <div className={`alert-controls${paused ? ' paused' : ''}`}>
      <span className="status">
        {paused ? '🔕' : '🔔'} {status}
      </span>
      <div className="buttons">
        {paused ? (
          <button onClick={() => void api.setPause('off')}>다시 켜기</button>
        ) : (
          <>
            <button onClick={() => void api.setPause('hour')}>1시간 끄기</button>
            <button onClick={() => void api.setPause('today')}>오늘 끄기</button>
          </>
        )}
      </div>
    </div>
  );
}
