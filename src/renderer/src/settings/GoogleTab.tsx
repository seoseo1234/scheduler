import { useEffect, useMemo, useState } from 'react';
import type { SettingsApi } from '@shared/api';
import type { ConnectionTestResult, GoogleInfo } from '@shared/ipc';
import type { GoogleSettings, Settings } from '@shared/types';
import appsScriptCode from '../../../../apps-script/Code.gs?raw';
import { SaveBar } from './SaveBar';
import { useDraft } from './useDraft';

interface Props {
  api: SettingsApi;
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
}

/** 추측하기 어려운 무작위 토큰 (32자) */
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
}

function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
  };
  return { copied, copy };
}

export function GoogleTab({ api, settings, update }: Props) {
  const source = useMemo(() => settings.google, [settings.google]);
  const { draft, setDraft, dirty, revert } = useDraft<GoogleSettings>(source);
  const [info, setInfo] = useState<GoogleInfo | null>(null);
  const [token, setToken] = useState('');
  const [test, setTest] = useState<ConnectionTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const { copied, copy } = useCopied();

  useEffect(() => {
    void api.googleInfo().then(setInfo);
  }, [api, settings.google]);

  const set = (patch: Partial<GoogleSettings>) => setDraft((d) => ({ ...d, ...patch }));

  /** 방금 만든 토큰. 복사할 수 있게 이 화면에서만 보여준다 (저장된 값은 다시 꺼내 볼 수 없다). */
  const [shownToken, setShownToken] = useState('');

  const saveToken = async () => {
    setInfo(await api.googleSetToken(token));
    setToken('');
    setShownToken('');
  };

  const createToken = async () => {
    if (info?.hasToken && !confirm('저장된 토큰을 새 토큰으로 바꿀까요? 구글 스크립트 속성의 TOKEN 값도 새 토큰으로 바꿔야 연결돼요.')) return;
    const next = generateToken();
    setInfo(await api.googleSetToken(next));
    setShownToken(next);
    setTest(null);
  };

  const deleteToken = async () => {
    if (!confirm('이 PC에 저장된 토큰을 지울까요? 지우면 구글 연동이 멈춰요.')) return;
    setInfo(await api.googleSetToken(''));
    setShownToken('');
    setTest(null);
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await api.googleTest(draft.webAppUrl, token));
    } finally {
      setTesting(false);
    }
  };

  const lists = [...new Set([...(info?.lists ?? []), ...(test?.lists ?? []), ...draft.lists])].sort((a, b) => a.localeCompare(b, 'ko'));
  const badNumber =
    !(draft.refreshMinutes >= 1 && draft.refreshMinutes <= 120) ||
    !(draft.days >= 1 && draft.days <= 60) ||
    !(draft.eventReminderMinutes >= 0 && draft.eventReminderMinutes <= 120);

  return (
    <section className="google-tab">
      <h2>구글 연동</h2>
      <p className="hint">
        교사 계정에 작은 Apps Script 웹 앱을 만들어 캘린더 일정과 할 일을 받아와요. 받아온 내용은 교사 위젯에만 보이고 학생 화면에는
        절대 나오지 않아요.
      </p>

      <ol className="wizard">
        <li>
          <b>새 프로젝트 만들기</b> — <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">script.google.com</a>
          에서 교사 구글 계정으로 새 프로젝트를 만들어요.
        </li>
        <li>
          <b>코드 붙여넣기</b> — 편집기에 있는 내용을 모두 지우고 아래 코드를 붙여넣은 뒤 저장(Ctrl+S)해요.
          <div className="row">
            <button onClick={() => void copy('code', appsScriptCode)}>{copied === 'code' ? '복사했어요 ✓' : 'Apps Script 코드 복사'}</button>
          </div>
        </li>
        <li>
          <b>Tasks API 추가</b> — 왼쪽 "서비스" 옆 <b>+</b> → <b>Google Tasks API</b> 선택 → 추가.
        </li>
        <li>
          <b>토큰 등록</b> — <b>새 토큰 만들기</b>를 누르면 이 PC에 바로 저장돼요(전에 저장한 토큰은 바뀌어요). <b>복사</b>한 뒤 왼쪽
          톱니바퀴(프로젝트 설정) → 스크립트 속성에 이름 <code>TOKEN</code>, 값에 붙여넣고 저장해요.
          <div className="token-box">
            <p className={info?.hasToken ? 'token-state saved' : 'token-state'}>
              {info?.hasToken ? '✓ 이 PC에 토큰이 저장되어 있어요.' : '아직 저장된 토큰이 없어요.'}
            </p>
            <div className="row">
              <button className="primary" onClick={() => void createToken()}>
                새 토큰 만들기
              </button>
              {info?.hasToken && (
                <button className="danger" onClick={() => void deleteToken()}>
                  토큰 지우기
                </button>
              )}
            </div>
            {shownToken && (
              <div className="row">
                <input className="token" value={shownToken} readOnly spellCheck={false} onFocus={(e) => e.target.select()} />
                <button onClick={() => void copy('token', shownToken)}>{copied === 'token' ? '복사했어요 ✓' : '복사'}</button>
              </div>
            )}
            {shownToken && <p className="hint small">이 값은 지금만 보여요. 창을 닫기 전에 복사해서 스크립트 속성에 붙여넣으세요.</p>}
            <details className="manual-token">
              <summary>다른 PC에서 쓰던 토큰 직접 입력하기</summary>
              <div className="row">
                <input
                  className="token"
                  value={token}
                  placeholder="토큰 붙여넣기"
                  onChange={(e) => setToken(e.target.value)}
                  spellCheck={false}
                />
                <button disabled={!token.trim()} onClick={() => void saveToken()}>
                  저장
                </button>
              </div>
            </details>
          </div>
          <p className="hint">
            스크립트 속성에 <code>TOKEN</code>이 이미 있으면 "속성 추가"를 하지 말고, <b>스크립트 속성 수정</b>을 눌러 기존{' '}
            <code>TOKEN</code>의 값을 새 토큰으로 바꾼 뒤 저장하세요. 지우려면 그 줄 오른쪽의 휴지통 아이콘을 누르면 돼요.
          </p>
        </li>
        <li>
          <b>웹 앱으로 배포</b> — 오른쪽 위 <b>배포 → 새 배포</b> → 유형 <b>웹 앱</b>, 실행 사용자 <b>나</b>, 액세스 권한{' '}
          <b>모든 사용자</b> → 배포 → 권한 허용. 나온 <b>웹 앱 URL</b>을 아래에 붙여넣어요.
          <div className="row">
            <input
              className="url"
              value={draft.webAppUrl}
              placeholder="https://script.google.com/macros/s/…/exec"
              onChange={(e) => set({ webAppUrl: e.target.value.trim() })}
              spellCheck={false}
            />
            <button onClick={() => void runTest()} disabled={testing}>
              {testing ? '확인 중…' : '연결 테스트'}
            </button>
          </div>
          {test && <div className={test.ok ? 'ok-box' : 'error'}>{test.message}</div>}
          {test?.ok && dirty && <p className="hint">연결이 잘 되면 아래 저장 버튼을 눌러 주세요.</p>}
        </li>
      </ol>

      {info && info.status.state !== 'notConfigured' && (
        <p className="hint">
          현재 상태: {info.status.state === 'ok' ? '정상' : info.status.state === 'offline' ? '오프라인' : info.status.state === 'loading' ? '동기화 중' : '오류'}
          {info.status.message && ` — ${info.status.message}`}
        </p>
      )}

      <h3>표시 설정</h3>
      <div className="field-row">
        <label>
          자동 새로고침
          <span>
            <input type="number" min={1} max={120} value={draft.refreshMinutes} onChange={(e) => set({ refreshMinutes: e.target.valueAsNumber })} />분마다
          </span>
        </label>
        <label>
          다가오는 일정
          <span>
            <input type="number" min={1} max={60} value={draft.days} onChange={(e) => set({ days: e.target.valueAsNumber })} />일
          </span>
        </label>
        <label>
          일정 미리 알림
          <span>
            <input
              type="number"
              min={0}
              max={120}
              value={draft.eventReminderMinutes}
              onChange={(e) => set({ eventReminderMinutes: e.target.valueAsNumber })}
            />
            분 전 (0이면 끔)
          </span>
        </label>
      </div>

      <h3>표시할 할 일 목록</h3>
      {lists.length === 0 ? (
        <p className="hint">연결 테스트를 하면 할 일 목록 이름이 나타나요. 아무것도 고르지 않으면 모든 목록을 보여줘요.</p>
      ) : (
        <div className="list-checks">
          {lists.map((name) => (
            <label key={name} className="check">
              <input
                type="checkbox"
                checked={draft.lists.includes(name)}
                onChange={(e) =>
                  set({ lists: e.target.checked ? [...draft.lists, name] : draft.lists.filter((l) => l !== name) })
                }
              />
              {name}
            </label>
          ))}
          <span className="hint">{draft.lists.length === 0 ? '(모두 표시)' : ''}</span>
        </div>
      )}

      <details className="trouble">
        <summary>연결이 안 될 때</summary>
        <ul>
          <li>
            <b>인터넷 연결</b>: 다른 사이트가 열리는지 확인해요.
          </li>
          <li>
            <b>학교망 방화벽</b>: script.google.com 접속이 막혀 있을 수 있어요. 정보 담당 선생님께 허용을 요청해요.
          </li>
          <li>
            <b>토큰 불일치</b>: 스크립트 속성의 TOKEN 값과 여기에 저장한 토큰이 같아야 해요.
          </li>
          <li>
            <b>배포 권한</b>: 액세스 권한이 "모든 사용자"인지, URL이 /exec로 끝나는지 확인해요. 코드를 고쳤다면 "배포 관리"에서 새 버전으로
            다시 배포해야 해요.
          </li>
        </ul>
      </details>

      <SaveBar dirty={dirty} onSave={() => void update({ google: draft })} onRevert={revert} blockedReason={badNumber ? '숫자 범위를 확인하세요.' : null} />
    </section>
  );
}
