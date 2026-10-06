import type { AlertSettings, Settings } from '../types';
import {
  alertVars,
  collectDueAlerts,
  computeAlerts,
  isPaused,
  renderAlertTemplate,
  type AlertKind,
  type ScheduledAlert,
} from './alerts';
import { getDayPlan, type PlannedBlock } from './dayPlan';
import { toDateKey } from './time';

export type SchedulerSource = Pick<
  Settings,
  'templates' | 'weekdayTemplate' | 'dateOverrides' | 'weeklySubjects' | 'subjectNotes' | 'subjectOverrides' | 'alerts'
>;

/** 화면에 띄울 알림 한 건 */
export interface AlertEvent {
  kind: AlertKind;
  text: string;
  /** 배너/오버레이를 내릴 시각 */
  until: Date;
  /** 알림음 재생 여부 */
  sound: boolean;
  preview?: boolean;
}

/** 예약된 알림을 화면에 띄울 이벤트로 바꾼다. */
export function toAlertEvent(alert: ScheduledAlert, alerts: AlertSettings, now: Date): AlertEvent {
  const text = renderAlertTemplate(alerts.templates[alert.kind], alertVars(alert));
  const start = alert.block.startAt.getTime();
  switch (alert.kind) {
    case 'banner':
      // 배너는 해당 교시 시작 시까지 유지
      return { kind: 'banner', text, until: new Date(start), sound: true };
    case 'overlay':
      return { kind: 'overlay', text, until: new Date(now.getTime() + alerts.overlaySeconds * 1000), sound: true };
    case 'start':
      return { kind: 'start', text, until: new Date(start + alerts.startBannerSeconds * 1000), sound: false };
  }
}

/**
 * 1초 틱마다 호출되어 도래한 알림을 dispatch한다. 타이머는 바깥에서 돌린다.
 * - 첫 틱과 reset() 직후 틱은 소급하지 않는다 (프로그램 시작, 절전 복귀).
 * - 하루 알림 목록은 날짜나 설정이 바뀔 때만 다시 계산한다.
 */
export class AlertScheduler {
  private prev: Date | null = null;
  private cache: { date: string; source: SchedulerSource; alerts: ScheduledAlert[] } | null = null;
  private fired = new Set<string>();

  constructor(
    private readonly getSource: () => SchedulerSource,
    private readonly dispatch: (event: AlertEvent) => void,
  ) {}

  /** 절전 복귀·잠금 해제 등: 다음 틱부터 새로 센다. */
  reset(): void {
    this.prev = null;
  }

  tick(now: Date): AlertEvent[] {
    const source = this.getSource();
    const alerts = this.alertsFor(source, now);
    const due = collectDueAlerts(alerts, this.prev, now).filter((a) => !this.fired.has(a.key));
    this.prev = now;
    if (due.length === 0 || isPaused(source.alerts, now)) return [];

    const events = due.map((a) => {
      this.fired.add(a.key);
      return toAlertEvent(a, source.alerts, now);
    });
    events.forEach(this.dispatch);
    return events;
  }

  /** 오늘의 다음 수업(없으면 예시 수업)으로 알림을 미리 보여준다. 일시정지와 무관하게 동작. */
  preview(kind: AlertKind, now: Date): AlertEvent {
    const source = this.getSource();
    const plan = getDayPlan(source, now);
    const nextClass =
      plan.status === 'school' ? plan.blocks.find((b) => b.kind === 'class' && b.startAt > now) : undefined;
    const block: PlannedBlock = nextClass ?? {
      id: 'preview',
      name: '3교시',
      kind: 'class',
      start: '',
      end: '',
      subject: '체육',
      note: '체육복 입고 운동장으로 가요.',
      startAt: now,
      endAt: now,
    };
    const minutesBefore = kind === 'start' ? 0 : (source.alerts.offsets.find((o) => o.style === kind)?.minutes ?? (kind === 'banner' ? 3 : 1));
    const alert: ScheduledAlert = { key: 'preview', at: now, kind, minutesBefore, block };
    const event = toAlertEvent(alert, source.alerts, now);
    // 미리보기 배너는 실제 교시 시작까지 남기지 않고 잠깐만 보여준다.
    if (kind !== 'overlay') event.until = new Date(now.getTime() + 8000);
    event.preview = true;
    this.dispatch(event);
    return event;
  }

  private alertsFor(source: SchedulerSource, now: Date): ScheduledAlert[] {
    const date = toDateKey(now);
    if (this.cache && this.cache.date === date && this.cache.source === source) return this.cache.alerts;
    if (this.cache && this.cache.date !== date) this.fired.clear();
    const alerts = computeAlerts(getDayPlan(source, now), source.alerts.offsets);
    this.cache = { date, source, alerts };
    return alerts;
  }
}
