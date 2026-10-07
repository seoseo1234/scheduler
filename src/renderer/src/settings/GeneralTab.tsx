import { useEffect, useState, type KeyboardEvent } from 'react';
import type { SettingsApi } from '@shared/api';
import type { AppInfo, AppUpdateStatus } from '@shared/ipc';
import type { Settings } from '@shared/types';

interface Props {
  api: SettingsApi;
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
  onSettings: (s: Settings) => void;
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta']);

/** 키 입력을 Electron 단축키 형식("Ctrl+Alt+H")으로 바꾼다. 조합키 없이 누르면 null */
function toAccelerator(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
  if (mods.length === 0) return null;
  let key = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : e.key;
  if (/^F\d{1,2}$/.test(e.code)) key = e.code;
  if (key.length === 1) key = key.toUpperCase();
  return [...mods, key].join('+');
}

export function GeneralTab({ api, settings, update, onSettings }: Props) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    void api.appInfo().then(setInfo);
  }, [api]);

  const doExport = async () => {
    const path = await api.exportSettings();
    if (path) setMessage({ ok: true, text: `내보냈어요: ${path}` });
  };

  const doImport = async () => {
    if (!confirm('설정 파일을 가져오면 지금 설정(시정표, 시간표, 아침 할 일, 알림, 구글 연동 표시 설정)을 덮어써요. 계속할까요?')) return;
    const res = await api.importSettings();
    if (!res) return;
    if (res.ok) {
      onSettings(res.settings);
      setMessage({ ok: true, text: '설정을 가져왔어요. 화면 배치와 구글 토큰은 이 PC 값을 그대로 써요.' });
    } else setMessage({ ok: false, text: res.message });
  };

  const reset = async () => {
    if (!confirm('모든 설정을 처음 상태로 되돌릴까요? (화면 배치와 구글 토큰은 유지돼요)')) return;
    onSettings(await api.reset());
    setMessage({ ok: true, text: '설정을 초기화했어요.' });
  };

  return (
    <section className="general-tab">
      <h2>일반</h2>
      {message && <div className={message.ok ? 'ok-box' : 'error'}>{message.text}</div>}

      <h3>시작</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.autoLaunch}
          disabled={info?.canAutoLaunch === false}
          onChange={(e) => void update({ autoLaunch: e.target.checked })}
        />
        윈도우에 로그인하면 자동으로 실행
      </label>
      {info?.canAutoLaunch === false && <p className="hint">개발 모드로 실행 중이라 자동 실행은 설치한 프로그램에서만 설정돼요.</p>}

      <h3>교사 위젯 가리기 단축키</h3>
      <div className="row">
        <input
          className="shortcut"
          readOnly
          value={recording ? '조합키와 함께 누르세요… (Esc 취소)' : settings.teacherHideShortcut || '사용 안 함'}
          onFocus={() => setRecording(true)}
          onBlur={() => setRecording(false)}
          onKeyDown={(e) => {
            e.preventDefault();
            if (e.key === 'Escape') return e.currentTarget.blur();
            const acc = toAccelerator(e);
            if (acc) {
              void update({ teacherHideShortcut: acc });
              e.currentTarget.blur();
            }
          }}
        />
        <button onClick={() => void update({ teacherHideShortcut: '' })} disabled={!settings.teacherHideShortcut}>
          끄기
        </button>
        <button onClick={() => void update({ teacherHideShortcut: 'Ctrl+Alt+H' })}>기본값</button>
      </div>
      <p className="hint">어느 창에서든 이 키를 누르면 교사 위젯 내용을 가리거나 다시 보여줘요.</p>

      <h3>백업</h3>
      <p className="hint">다른 PC나 다음 학년도에 설정을 그대로 쓰고 싶을 때 파일로 내보내고 가져와요. 구글 토큰은 파일에 들어가지 않아요.</p>
      <div className="row">
        <button onClick={() => void doExport()}>설정 내보내기…</button>
        <button onClick={() => void doImport()}>설정 가져오기…</button>
      </div>

      <h3>초기화</h3>
      <button className="danger" onClick={() => void reset()}>
        설정 초기화
      </button>

      <h3>정보</h3>
      <p className="hint">
        우리반 시계 {info ? `v${info.version}` : ''}
        {info?.edition === 'portable' ? ' (무설치판)' : info?.edition === 'dev' ? ' (개발 모드)' : ''}
      </p>
      <UpdateSection api={api} />
    </section>
  );
}

function updateText(status: AppUpdateStatus): string {
  switch (status.state) {
    case 'idle':
      return '프로그램이 켜져 있으면 6시간마다 새 버전을 확인해요.';
    case 'checking':
      return '새 버전이 있는지 확인하는 중이에요…';
    case 'latest':
      return `최신 버전이에요. (${new Date(status.checkedAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })} 확인)`;
    case 'downloading':
      return `새 버전 v${status.version}을 받는 중이에요… ${status.percent}%`;
    case 'downloaded':
      return `새 버전 v${status.version}을 받아 두었어요. 프로그램을 끌 때 자동으로 설치돼요.`;
    case 'manual':
      return `새 버전 v${status.version}이 나왔어요. 홈페이지에서 내려받아 주세요.`;
    case 'error':
      return status.message;
  }
}

function UpdateSection({ api }: { api: SettingsApi }) {
  const [status, setStatus] = useState<AppUpdateStatus>({ state: 'idle' });

  useEffect(() => {
    const off = api.onUpdate(setStatus);
    void api.updateStatus().then(setStatus);
    return off;
  }, [api]);

  const busy = status.state === 'checking' || status.state === 'downloading';
  return (
    <>
      <h3>업데이트</h3>
      <p className={status.state === 'error' ? 'err-text' : 'hint'}>{updateText(status)}</p>
      <div className="row">
        {status.state === 'downloaded' ? (
          <button className="primary" onClick={() => void api.installUpdate()}>
            지금 설치하고 다시 시작
          </button>
        ) : status.state === 'manual' ? (
          <button className="primary" onClick={() => void api.openDownloadPage()}>
            홈페이지에서 내려받기
          </button>
        ) : (
          <button onClick={() => void api.checkUpdate()} disabled={busy}>
            업데이트 확인
          </button>
        )}
        <button className="link" onClick={() => void api.openDownloadPage()}>
          홈페이지 열기
        </button>
      </div>
    </>
  );
}
