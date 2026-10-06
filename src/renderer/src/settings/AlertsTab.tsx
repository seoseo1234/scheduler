import { useMemo } from 'react';
import type { SettingsApi } from '@shared/api';
import { renderAlertTemplate, type AlertKind } from '@shared/schedule';
import type { AlertOffset, AlertSettings, Settings, SoundPreset } from '@shared/types';
import { newId } from '../common/id';
import { playSound } from '../common/sound';
import { SaveBar } from './SaveBar';
import { useDraft } from './useDraft';

interface Props {
  api: SettingsApi;
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
}

const PRESETS: { value: SoundPreset; label: string }[] = [
  { value: 'dingdong', label: '딩동' },
  { value: 'chime', label: '차임' },
  { value: 'xylophone', label: '실로폰' },
  { value: 'custom', label: '내 소리 파일' },
];

const TEMPLATE_FIELDS: { key: AlertKind; label: string; minutes: number }[] = [
  { key: 'banner', label: '배너 알림 (예: 3분 전)', minutes: 3 },
  { key: 'overlay', label: '전체 화면 알림 (예: 1분 전)', minutes: 1 },
  { key: 'start', label: '수업 시작', minutes: 0 },
];

const SAMPLE = { 교시: '3교시', 과목: '체육', 준비물: '체육복 입고 운동장으로 가요.' };

export function AlertsTab({ api, settings, update }: Props) {
  // 일시정지 상태는 이 탭에서 다루지 않으므로 비교 대상에서 뺀다.
  const source = useMemo(() => ({ ...settings.alerts, pausedUntil: null }), [settings.alerts]);
  const { draft, setDraft, dirty, revert } = useDraft<AlertSettings>(source);

  const setOffset = (id: string, patch: Partial<AlertOffset>) =>
    setDraft((d) => ({ ...d, offsets: d.offsets.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const setSound = (patch: Partial<AlertSettings['sound']>) => setDraft((d) => ({ ...d, sound: { ...d.sound, ...patch } }));

  const badOffset = draft.offsets.find((o) => !Number.isInteger(o.minutes) || o.minutes < 1 || o.minutes > 60);
  const blockedReason = badOffset
    ? '알림 시점은 1~60분 사이로 입력하세요.'
    : draft.sound.preset === 'custom' && !draft.sound.file
      ? '알림음 파일을 선택하세요.'
      : null;

  const testSound = async () => {
    const { preset, file, volume } = draft.sound;
    if (preset === 'custom') {
      const data = await api.readSoundFile(file);
      if (!data) return alert('소리 파일을 읽을 수 없어요.');
      return playSound({ preset, volume, data });
    }
    return playSound({ preset, volume });
  };

  const pickFile = async () => {
    const path = await api.pickSoundFile();
    if (path) setSound({ preset: 'custom', file: path });
  };

  return (
    <section className="alerts-tab">
      <h2>알림</h2>

      <h3>알림 시점</h3>
      <p className="hint">수업(종류가 "수업"인 구간) 시작 몇 분 전에 알릴지 정해요.</p>
      <table className="offsets">
        <tbody>
          {[...draft.offsets]
            .sort((a, b) => b.minutes - a.minutes)
            .map((o) => (
              <tr key={o.id}>
                <td>
                  <input type="checkbox" checked={o.enabled} onChange={(e) => setOffset(o.id, { enabled: e.target.checked })} />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={Number.isNaN(o.minutes) ? '' : o.minutes}
                    className={o === badOffset ? 'bad' : ''}
                    onChange={(e) => setOffset(o.id, { minutes: e.target.valueAsNumber })}
                  />
                  분 전
                </td>
                <td>
                  <select value={o.style} onChange={(e) => setOffset(o.id, { style: e.target.value as AlertOffset['style'] })}>
                    <option value="banner">학생 위젯 배너</option>
                    <option value="overlay">전체 화면</option>
                  </select>
                </td>
                <td>
                  <button title="삭제" onClick={() => setDraft((d) => ({ ...d, offsets: d.offsets.filter((x) => x.id !== o.id) }))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <button
        onClick={() =>
          setDraft((d) => ({ ...d, offsets: [...d.offsets, { id: newId('off'), minutes: 5, style: 'banner', enabled: true }] }))
        }
      >
        시점 추가
      </button>

      <div className="field-row">
        <label>
          전체 화면 알림 표시 시간
          <span>
            <input
              type="number"
              min={1}
              max={120}
              value={draft.overlaySeconds}
              onChange={(e) => setDraft((d) => ({ ...d, overlaySeconds: e.target.valueAsNumber }))}
            />
            초
          </span>
        </label>
        <label>
          수업 시작 배너 표시 시간
          <span>
            <input
              type="number"
              min={1}
              max={120}
              value={draft.startBannerSeconds}
              onChange={(e) => setDraft((d) => ({ ...d, startBannerSeconds: e.target.valueAsNumber }))}
            />
            초
          </span>
        </label>
      </div>

      <h3>알림 문구</h3>
      <p className="hint">
        쓸 수 있는 변수: <code>{'{교시}'}</code> <code>{'{과목}'}</code> <code>{'{준비물}'}</code> <code>{'{남은분}'}</code> · "이에요/예요"는 받침에
        맞춰 자동으로 고쳐져요.
      </p>
      {TEMPLATE_FIELDS.map(({ key, label, minutes }) => (
        <label key={key} className="template-field">
          {label}
          <input
            value={draft.templates[key]}
            onChange={(e) => setDraft((d) => ({ ...d, templates: { ...d.templates, [key]: e.target.value } }))}
          />
          <span className="preview">미리보기: {renderAlertTemplate(draft.templates[key], { ...SAMPLE, 남은분: minutes })}</span>
        </label>
      ))}

      <h3>알림음</h3>
      <div className="field-row">
        <label>
          소리
          <select value={draft.sound.preset} onChange={(e) => setSound({ preset: e.target.value as SoundPreset })}>
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          볼륨 {Math.round(draft.sound.volume * 100)}%
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(draft.sound.volume * 100)}
            onChange={(e) => setSound({ volume: Number(e.target.value) / 100 })}
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.sound.muted} onChange={(e) => setSound({ muted: e.target.checked })} />
          음소거
        </label>
      </div>
      {draft.sound.preset === 'custom' && (
        <div className="row">
          <button onClick={() => void pickFile()}>파일 선택…</button>
          <span className="hint file-path">{draft.sound.file || '선택한 파일 없음 (mp3, wav)'}</span>
        </div>
      )}
      <div className="row">
        <button onClick={() => void testSound()}>소리 듣기</button>
      </div>

      <h3>알림 미리보기</h3>
      <p className="hint">저장된 설정으로 학생 모니터에 알림을 띄워 봐요. (일시정지 중에도 동작)</p>
      <div className="row">
        <button onClick={() => void api.previewAlert('banner')}>배너</button>
        <button onClick={() => void api.previewAlert('overlay')}>전체 화면</button>
        <button onClick={() => void api.previewAlert('start')}>수업 시작</button>
      </div>

      <SaveBar
        dirty={dirty}
        // 일시정지는 트레이·교사 위젯에서 따로 바뀌므로 저장할 때 현재 값을 유지한다.
        onSave={() => void update({ alerts: { ...draft, pausedUntil: settings.alerts.pausedUntil } })}
        onRevert={revert}
        blockedReason={blockedReason}
      />
    </section>
  );
}
