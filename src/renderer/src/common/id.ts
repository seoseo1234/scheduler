let seq = 0;

/** 설정 항목용 짧은 고유 id */
export function newId(prefix: string): string {
  seq = (seq + 1) % 1296;
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;
}
