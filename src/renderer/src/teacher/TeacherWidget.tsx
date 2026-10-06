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
import type { AlertSettings, GoogleEvent, GoogleSnapshot, GoogleStatus, TeacherSettings } from '@shared/types';
import { MorningTasksQuickEditor } from '../common/MorningTasksEditor';
import { useApiSettings } from '../common/useApiSettings';
import { useNow } from '../common/useNow';
import { useWidgetDisplay } from '../common/widget';

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
            <Tasks snapshot={google} settings={settings} now={now} />
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
        <span>{open ? '▾' : '▸'}</span> {title}
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
        <p className="placeholder">오늘 일정이 없어요.</p>
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
                    <span className="time">종일</span>
                    <span className="what">{e.title}</span>
                  </li>
                ))}
                {g.timed.map((e) => (
                  <li key={e.id}>
                    <span className="time">{formatKoreanTime(eventStart(e))}</span>
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

function Tasks({ snapshot, settings, now }: { snapshot: GoogleSnapshot | null; settings: TeacherSettings; now: Date }) {
  if (!snapshot?.data) return <p className="placeholder">구글 태스크가 연결되지 않았어요.</p>;
  const groups = groupTasks(snapshot.data.tasks, now, settings.google.lists);
  if (groups.length === 0) return <p className="placeholder">남은 할 일이 없어요. 🎉</p>;
  const multipleLists = new Set(snapshot.data.tasks.map((t) => t.list)).size > 1;
  return (
    <div className="tasks">
      {groups.map((g) => (
        <div key={g.bucket} className={`bucket bucket-${g.bucket}`}>
          <div className="sub-head">{TASK_BUCKET_LABEL[g.bucket]}</div>
          <ul>
            {g.tasks.map((t) => (
              <li key={`${t.list}|${t.id}`} title={t.notes || undefined}>
                <span className="what">{t.title}</span>
                {t.due && g.bucket !== 'today' && (
                  <span className="due">
                    {Number(t.due.slice(5, 7))}/{Number(t.due.slice(8, 10))}
                  </span>
                )}
                {multipleLists && <span className="list">{t.list}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
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
