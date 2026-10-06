import { useEffect, useMemo, useState } from 'react';
import type { StudentApi } from '@shared/api';
import type { BannerPayload } from '@shared/ipc';
import {
  blockLabel,
  formatKoreanDate,
  formatKoreanTime,
  getCurrentState,
  getDayPlan,
  getMorningTasks,
  isBlockPast,
  toDateKey,
  type CurrentState,
  type DayPlan,
} from '@shared/schedule';
import type { StudentSettings } from '@shared/types';
import { useApiSettings } from '../common/useApiSettings';
import { useNow } from '../common/useNow';
import { playSound } from '../common/sound';
import { useWidgetDisplay } from '../common/widget';

export function StudentWidget({ api }: { api: StudentApi }) {
  const settings = useApiSettings(api);
  const now = useNow();
  useWidgetDisplay(settings?.display);
  const banner = useBanner(api, now);

  const dateKey = toDateKey(now);
  // 날짜가 바뀌거나 설정이 바뀔 때만 하루 계획을 다시 만든다.
  const plan = useMemo(() => (settings ? getDayPlan(settings, now) : null), [settings, dateKey]);

  if (!settings || !plan) return <div className="student drag" />;
  const state = getCurrentState(plan, now);
  const morning = state.phase === 'inBlock' && state.current.kind === 'morning';

  return (
    <div className="student drag">
      {banner && <div className={`banner banner-${banner.kind}`}>{banner.text}</div>}
      <header className="clock">
        <div className="time">{formatKoreanTime(now)}</div>
        <div className="date">{formatKoreanDate(now)}</div>
      </header>
      <StatusLine state={state} />
      {morning ? <MorningTasks settings={settings} now={now} /> : <Timetable plan={plan} now={now} state={state} />}
    </div>
  );
}

function StatusLine({ state }: { state: CurrentState }) {
  switch (state.phase) {
    case 'noSchool':
      return <div className="status calm">오늘은 수업이 없는 날이에요 🌈</div>;
    case 'afterSchool':
      return <div className="status calm">오늘 수업이 모두 끝났어요. 수고했어요! 👏</div>;
    case 'beforeSchool':
    case 'gap':
      return (
        <div className="status">
          <div className="now">{state.phase === 'gap' ? '잠깐 쉬어요' : '좋은 아침이에요!'}</div>
          <div className="next">
            {state.minutesUntilNext > 60
              ? `${formatKoreanTime(state.next.startAt)}에 ${blockLabel(state.next)} 시작`
              : `${state.minutesUntilNext}분 뒤 ${blockLabel(state.next)}`}
          </div>
        </div>
      );
    case 'inBlock':
      return (
        <div className={`status kind-${state.current.kind}`}>
          <div className="now">
            {blockLabel(state.current)} <span className="left">· {state.minutesLeft}분 남음</span>
          </div>
          {state.next && <div className="next">다음: {blockLabel(state.next)}</div>}
        </div>
      );
  }
}

function Timetable({ plan, now, state }: { plan: DayPlan; now: Date; state: CurrentState }) {
  if (plan.status !== 'school') return null;
  const classes = plan.blocks.filter((b) => b.kind === 'class');
  if (classes.length === 0) return null;
  const currentId = state.phase === 'inBlock' ? state.current.id : null;
  return (
    <ol className="timetable">
      {classes.map((b) => (
        <li key={b.id} className={b.id === currentId ? 'current' : isBlockPast(b, now) ? 'past' : ''}>
          <span className="period">{b.name}</span>
          <span className="subject">{b.subject || '—'}</span>
        </li>
      ))}
    </ol>
  );
}

function MorningTasks({ settings, now }: { settings: StudentSettings; now: Date }) {
  const tasks = getMorningTasks(settings, now);
  return (
    <section className="morning">
      <h2>아침에 할 일</h2>
      {tasks.length === 0 ? (
        <p className="empty">오늘 아침 할 일이 없어요.</p>
      ) : (
        <ol>
          {tasks.map((t, i) => (
            <li key={t.id} className={t.done ? 'done' : ''}>
              <span className="num">{i + 1}</span>
              {t.icon && <span className="icon">{t.icon}</span>}
              <span className="text">{t.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** 메인에서 받은 배너를 until 시각까지 보여준다. 알림음도 여기서 재생한다. */
function useBanner(api: StudentApi, now: Date): BannerPayload | null {
  const [banner, setBanner] = useState<BannerPayload | null>(null);
  useEffect(() => {
    const offs = [api.onBanner(setBanner), api.onSound((s) => void playSound(s))];
    return () => offs.forEach((off) => off());
  }, [api]);
  if (!banner || Date.parse(banner.until) <= now.getTime()) return null;
  return banner;
}
