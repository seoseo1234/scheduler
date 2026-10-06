import type { DayPlan, PlannedBlock } from './dayPlan';
import { remainingMinutes } from './time';

export type CurrentState =
  | { phase: 'noSchool' }
  /** 첫 구간 시작 전 */
  | { phase: 'beforeSchool'; next: PlannedBlock; minutesUntilNext: number }
  /** 구간 진행 중 */
  | { phase: 'inBlock'; current: PlannedBlock; minutesLeft: number; next: PlannedBlock | null }
  /** 구간 사이 빈 시간 (시정표에 쉬는시간을 넣지 않은 경우 등) */
  | { phase: 'gap'; next: PlannedBlock; minutesUntilNext: number }
  /** 마지막 구간 종료 후 */
  | { phase: 'afterSchool' };

export function getCurrentState(plan: DayPlan, now: Date): CurrentState {
  if (plan.status === 'noSchool' || plan.blocks.length === 0) return { phase: 'noSchool' };
  const t = now.getTime();
  const { blocks } = plan;

  // 겹친 구간이 있으면 나중에 시작한 구간을 현재로 본다 (저장 전 검사로 보통은 겹치지 않음).
  let current: PlannedBlock | null = null;
  for (const b of blocks) {
    if (b.startAt.getTime() <= t && t < b.endAt.getTime()) current = b;
  }
  const next = blocks.find((b) => b.startAt.getTime() > t) ?? null;

  if (current) {
    return { phase: 'inBlock', current, minutesLeft: remainingMinutes(current.endAt.getTime() - t), next };
  }
  if (!next) return { phase: 'afterSchool' };
  const minutesUntilNext = remainingMinutes(next.startAt.getTime() - t);
  return next === blocks[0] ? { phase: 'beforeSchool', next, minutesUntilNext } : { phase: 'gap', next, minutesUntilNext };
}

/** 해당 블록이 이미 끝났는지 (시간표 요약에서 흐리게 표시) */
export function isBlockPast(block: PlannedBlock, now: Date): boolean {
  return block.endAt.getTime() <= now.getTime();
}
