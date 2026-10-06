import type { AlertOffset, AlertSettings } from '../types';
import type { DayPlan, PlannedBlock } from './dayPlan';

export type AlertKind = 'banner' | 'overlay' | 'start';

export interface ScheduledAlert {
  /** 같은 알림을 두 번 띄우지 않기 위한 키: 날짜|블록|종류|분 */
  key: string;
  at: Date;
  kind: AlertKind;
  /** 몇 분 전 알림인지 (start는 0) */
  minutesBefore: number;
  block: PlannedBlock;
}

/**
 * 하루치 알림 목록을 시각순으로 계산한다.
 * 대상은 kind가 'class'인 구간의 시작 시각.
 */
export function computeAlerts(plan: DayPlan, offsets: AlertOffset[]): ScheduledAlert[] {
  if (plan.status !== 'school') return [];
  const enabled = offsets.filter((o) => o.enabled && Number.isFinite(o.minutes) && o.minutes > 0);
  const alerts: ScheduledAlert[] = [];

  for (const block of plan.blocks) {
    if (block.kind !== 'class') continue;
    const start = block.startAt.getTime();
    for (const o of enabled) {
      alerts.push({
        key: `${plan.date}|${block.id}|${o.style}|${o.minutes}`,
        at: new Date(start - o.minutes * 60_000),
        kind: o.style,
        minutesBefore: o.minutes,
        block,
      });
    }
    alerts.push({ key: `${plan.date}|${block.id}|start|0`, at: new Date(start), kind: 'start', minutesBefore: 0, block });
  }
  return alerts.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** 틱 간격이 이보다 크게 벌어지면 절전 복귀·시계 변경으로 보고 소급 알림을 하지 않는다. */
export const MAX_TICK_GAP_MS = 3_000;

/**
 * 직전 틱(prev)과 이번 틱(now) 사이에 도래한 알림을 고른다. 구간은 (prev, now].
 * - prev가 null(프로그램 첫 실행)이면 아무것도 고르지 않는다 → 켜기 전 지난 알림은 소급하지 않음.
 * - 틱 간격이 MAX_TICK_GAP_MS를 넘으면(절전 복귀 등) 역시 소급하지 않는다.
 * - 시계가 뒤로 간 경우(now <= prev)도 고르지 않는다.
 */
export function collectDueAlerts(
  alerts: ScheduledAlert[],
  prev: Date | null,
  now: Date,
  maxGapMs = MAX_TICK_GAP_MS,
): ScheduledAlert[] {
  if (!prev) return [];
  const p = prev.getTime();
  const n = now.getTime();
  if (n <= p || n - p > maxGapMs) return [];
  return alerts.filter((a) => {
    const t = a.at.getTime();
    return t > p && t <= n;
  });
}

export function isPaused(alerts: Pick<AlertSettings, 'pausedUntil'>, now: Date): boolean {
  if (!alerts.pausedUntil) return false;
  const until = Date.parse(alerts.pausedUntil);
  return Number.isFinite(until) && now.getTime() < until;
}

/** "오늘 알림 끄기": 다음 날 0시까지 */
export function pauseUntilEndOfDay(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
}

/** "1시간 알림 끄기" */
export function pauseForMinutes(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

// ---- 문구 템플릿 ----

export interface AlertTemplateVars {
  교시: string;
  과목: string;
  준비물: string;
  남은분: number | string;
}

export function alertVars(alert: ScheduledAlert): AlertTemplateVars {
  return {
    교시: alert.block.name,
    과목: alert.block.subject,
    준비물: alert.block.note,
    남은분: alert.minutesBefore,
  };
}

/** 한글 음절의 받침 유무. 한글이 아니면 숫자 끝 등을 고려해 판단한다. */
function hasBatchim(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  // 숫자: 0(영), 1(일), 3(삼), 6(육), 7(칠), 8(팔)은 받침 있음
  if (/[0-9]/.test(ch)) return '013678'.includes(ch);
  // 영문 등은 받침 없는 것으로 본다.
  return false;
}

/**
 * {교시} {과목} {준비물} {남은분} 변수를 채운다.
 * - 빈 변수로 생긴 공백을 정리한다.
 * - "이에요/예요"는 앞 글자 받침에 맞춰 고친다. (체육이에요 / 국어예요)
 */
export function renderAlertTemplate(template: string, vars: AlertTemplateVars): string {
  let text = template.replace(/\{(교시|과목|준비물|남은분)\}/g, (_, name: keyof AlertTemplateVars) =>
    String(vars[name] ?? ''),
  );
  // 변수가 비어 "3교시 이에요"처럼 떨어진 조사를 앞말에 붙인다.
  text = text.replace(/[ \t]+(이에요|예요)/g, '$1');
  text = text.replace(/(\S)(이에요|예요)/g, (_, prev: string) => `${prev}${hasBatchim(prev) ? '이에요' : '예요'}`);
  return text.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.!?,])/g, '$1').trim();
}
