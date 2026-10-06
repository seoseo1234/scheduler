import { useEffect, useRef, useState } from 'react';

/**
 * 설정 일부를 편집용 사본으로 들고 있는다.
 * 저장하지 않은 변경이 없을 때만 바깥 설정 변경(다른 창에서 수정 등)을 따라간다.
 */
export function useDraft<T>(source: T) {
  const [draft, setDraft] = useState<T>(source);
  const sourceJson = JSON.stringify(source);
  const dirty = JSON.stringify(draft) !== sourceJson;
  const lastSource = useRef(sourceJson);

  useEffect(() => {
    if (lastSource.current === sourceJson) return;
    const wasEdited = JSON.stringify(draft) !== lastSource.current;
    lastSource.current = sourceJson;
    if (!wasEdited) setDraft(source);
    // source 객체 대신 직렬화 값으로 변화를 감지한다.
  }, [sourceJson]);

  return { draft, setDraft, dirty, revert: () => setDraft(source) };
}
