import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

/** 아침 할 일에 자주 쓰는 이모지 */
const EMOJIS = [
  '📒', '📚', '✏️', '📝', '📔', '🔢', '🎒', '👟',
  '🥛', '💧', '🪥', '🧼', '🧹', '🪴', '🍚', '✉️',
  '📥', '🎨', '🎵', '⚽', '💻', '👋', '🤫', '⏰',
  '🙌', '😊', '⭐', '✅', '🌈', '🍀', '🐣', '🎉',
];

/** 글자에 들어 있는 말로 어울리는 이모지를 고른다. 없으면 undefined */
const KEYWORDS: [RegExp, string][] = [
  [/청소|정리|정돈/, '🧹'],
  [/알림장/, '📒'],
  [/독서|책/, '📚'],
  [/일기/, '📔'],
  [/받아쓰기|시험|쪽지/, '📝'],
  [/숙제|과제|문제집|학습지/, '✏️'],
  [/수학|구구단|연산/, '🔢'],
  [/가방|사물함/, '🎒'],
  [/실내화|신발/, '👟'],
  [/우유/, '🥛'],
  [/화분|식물|물 ?주기/, '🪴'],
  [/물/, '💧'],
  [/양치|이 닦/, '🪥'],
  [/손 ?씻/, '🧼'],
  [/급식|밥/, '🍚'],
  [/가정통신문|통신문|편지/, '✉️'],
  [/제출|내기|걷기/, '📥'],
  [/그림|미술/, '🎨'],
  [/음악|리코더|노래/, '🎵'],
  [/체육|줄넘기|운동/, '⚽'],
  [/컴퓨터|태블릿|패드/, '💻'],
  [/인사/, '👋'],
  [/조용|침묵/, '🤫'],
  [/시간|시계/, '⏰'],
];

export function suggestEmoji(text: string): string | undefined {
  return KEYWORDS.find(([re]) => re.test(text))?.[1];
}

/** 이모지 버튼. 누르면 고를 수 있는 이모지 판이 열린다. */
export function EmojiPicker({ value, onPick }: { value?: string; onPick: (icon: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (icon: string | undefined) => {
    onPick(icon);
    setOpen(false);
    setCustom('');
  };
  const onCustomKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && custom.trim()) pick(custom.trim());
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <span className="emoji-picker" ref={ref}>
      <button className="emoji-button" title="이모지 고르기" onClick={() => setOpen((o) => !o)}>
        {value || <span className="emoji-none">🙂</span>}
      </button>
      {open && (
        <div className="emoji-pop">
          <div className="emoji-grid">
            {EMOJIS.map((e) => (
              <button key={e} className={e === value ? 'on' : undefined} onClick={() => pick(e)}>
                {e}
              </button>
            ))}
          </div>
          <div className="emoji-foot">
            <input
              value={custom}
              maxLength={4}
              placeholder="직접 입력 (Win+.)"
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={onCustomKey}
            />
            <button onClick={() => pick(undefined)}>없애기</button>
          </div>
        </div>
      )}
    </span>
  );
}
