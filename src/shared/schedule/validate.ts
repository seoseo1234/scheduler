import type { Block } from '../types';
import { isValidHHmm, parseHHmm } from './time';

export type BlockErrorCode = 'emptyName' | 'invalidStart' | 'invalidEnd' | 'startNotBeforeEnd' | 'overlap';

export interface BlockError {
  /** 입력 순서 기준 행 번호 (0부터) */
  index: number;
  code: BlockErrorCode;
  message: string;
  /** overlap일 때 겹치는 상대 행 */
  otherIndex?: number;
}

/**
 * 템플릿 구간을 저장 전에 검사한다. 오류가 하나라도 있으면 저장하지 않는다.
 * 겹침은 [start, end) 구간 기준이라 앞 구간 종료 = 다음 구간 시작은 허용.
 */
export function validateBlocks(blocks: Block[]): BlockError[] {
  const errors: BlockError[] = [];
  const valid: { index: number; start: number; end: number }[] = [];

  blocks.forEach((b, index) => {
    if (b.name.trim() === '') errors.push({ index, code: 'emptyName', message: '이름을 입력하세요.' });
    const startOk = isValidHHmm(b.start);
    const endOk = isValidHHmm(b.end);
    if (!startOk) errors.push({ index, code: 'invalidStart', message: '시작 시각을 HH:mm 형식으로 입력하세요.' });
    if (!endOk) errors.push({ index, code: 'invalidEnd', message: '종료 시각을 HH:mm 형식으로 입력하세요.' });
    if (!startOk || !endOk) return;
    const start = parseHHmm(b.start);
    const end = parseHHmm(b.end);
    if (start >= end) {
      errors.push({ index, code: 'startNotBeforeEnd', message: '시작 시각이 종료 시각보다 빨라야 해요.' });
      return;
    }
    valid.push({ index, start, end });
  });

  const sorted = [...valid].sort((a, b) => a.start - b.start || a.index - b.index);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end; j++) {
      const a = sorted[i];
      const b = sorted[j];
      errors.push({ index: a.index, code: 'overlap', otherIndex: b.index, message: `${b.index + 1}번 행과 시간이 겹쳐요.` });
      errors.push({ index: b.index, code: 'overlap', otherIndex: a.index, message: `${a.index + 1}번 행과 시간이 겹쳐요.` });
    }
  }

  return errors.sort((a, b) => a.index - b.index);
}
