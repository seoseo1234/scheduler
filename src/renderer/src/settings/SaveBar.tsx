interface Props {
  dirty: boolean;
  onSave: () => void;
  onRevert: () => void;
  /** 저장할 수 없는 이유 (있으면 저장 버튼 비활성) */
  blockedReason?: string | null;
}

export function SaveBar({ dirty, onSave, onRevert, blockedReason }: Props) {
  return (
    <div className={`save-bar${dirty ? ' dirty' : ''}`}>
      <span className="state">
        {blockedReason ? <span className="err-text">{blockedReason}</span> : dirty ? '저장하지 않은 변경이 있어요.' : '저장됨'}
      </span>
      <button onClick={onRevert} disabled={!dirty}>
        되돌리기
      </button>
      <button className="primary" onClick={onSave} disabled={!dirty || !!blockedReason}>
        저장
      </button>
    </div>
  );
}
