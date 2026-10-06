// 시각/날짜 유틸. 모든 계산은 PC 로컬 시각 기준.

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidHHmm(value: string): boolean {
  return HHMM.test(value);
}

/** "09:40" → 580 (자정부터 분). 형식이 틀리면 NaN */
export function parseHHmm(value: string): number {
  const m = HHMM.exec(value);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 로컬 날짜 키 "2026-10-05" */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 해당 날짜 0시 0분 (로컬) */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** date가 속한 날의 "HH:mm" 시각 */
export function atTime(date: Date, hhmm: string): Date {
  const minutes = parseHHmm(hhmm);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60);
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

export function weekdayKo(date: Date): string {
  return WEEKDAY_KO[date.getDay()];
}

/** "오전 9:37" */
export function formatKoreanTime(date: Date, withSeconds = false): string {
  const h = date.getHours();
  const period = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = withSeconds ? `:${String(date.getSeconds()).padStart(2, '0')}` : '';
  return `${period} ${h12}:${mm}${ss}`;
}

/** "10월 5일 월요일" */
export function formatKoreanDate(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdayKo(date)}요일`;
}

/** 남은 시간(ms)을 "23분 남음"에 쓰는 분 단위로 올림 */
export function remainingMinutes(ms: number): number {
  return Math.max(0, Math.ceil(ms / 60000));
}
