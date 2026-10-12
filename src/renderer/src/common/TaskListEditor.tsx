import { useEffect, useState, type KeyboardEvent } from 'react';
import type { TaskItem } from '@shared/types';
import { EmojiPicker, suggestEmoji } from './EmojiPicker';
import { newId } from './id';
import './editor.css';

interface Props {
  items: TaskItem[];
  onChange: (items: TaskItem[]) => void;
  placeholder?: string;
}

/**
 * 할 일 목록 인라인 편집: 추가/수정/삭제/순서 변경.
 * 글자 입력 중에는 저장하지 않고, 칸을 벗어나거나 Enter를 누를 때 저장한다.
 */
export function TaskListEditor({ items, onChange, placeholder = '할 일을 입력하고 Enter' }: Props) {
  const [local, setLocal] = useState(items);
  const [draft, setDraft] = useState('');
  useEffect(() => setLocal(items), [items]);

  const commit = (next: TaskItem[]) => {
    setLocal(next);
    onChange(next);
  };
  const patchLocal = (i: number, patch: Partial<TaskItem>) =>
    setLocal((list) => list.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const commitIfChanged = () => {
    const cleaned = local.filter((t) => t.text.trim() !== '');
    if (JSON.stringify(cleaned) !== JSON.stringify(items)) commit(cleaned);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= local.length) return;
    const next = [...local];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    // 할 일 내용에 맞는 이모지를 붙여 준다 (나중에 눌러서 바꿀 수 있다).
    commit([...local, { id: newId('mt'), text, icon: suggestEmoji(text) }]);
    setDraft('');
  };
  const onEnter = (e: KeyboardEvent<HTMLInputElement>, fn: () => void) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) fn();
  };

  return (
    <div className="task-editor">
      <ol>
        {local.map((t, i) => (
          <li key={t.id}>
            <EmojiPicker value={t.icon} onPick={(icon) => commit(local.map((x, j) => (j === i ? { ...x, icon } : x)))} />
            <input
              className="text"
              value={t.text}
              onChange={(e) => patchLocal(i, { text: e.target.value })}
              onBlur={commitIfChanged}
              onKeyDown={(e) => onEnter(e, () => e.currentTarget.blur())}
            />
            <button title="위로" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button title="아래로" disabled={i === local.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button title="삭제" onClick={() => commit(local.filter((_, j) => j !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ol>
      <div className="add">
        <input value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => onEnter(e, add)} />
        <button onClick={add} disabled={!draft.trim()}>
          추가
        </button>
      </div>
    </div>
  );
}
