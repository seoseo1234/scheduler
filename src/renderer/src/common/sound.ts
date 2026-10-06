// 알림음. 기본 소리는 Web Audio로 합성해 파일이 필요 없다.
import type { SoundPayload } from '@shared/ipc';

let ctx: AudioContext | null = null;

function audio(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface Note {
  freq: number;
  /** 재생 시작 시점(초) */
  at: number;
  /** 소리가 사라지는 데 걸리는 시간(초) */
  decay: number;
}

/** 종소리 느낌: 기본음 + 배음 몇 개를 지수 감쇠로 */
function bell(ac: AudioContext, out: AudioNode, { freq, at, decay }: Note, partials: [number, number][]): void {
  const t0 = ac.currentTime + at;
  for (const [ratio, gain] of partials) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay / ratio);
    osc.connect(g).connect(out);
    osc.start(t0);
    osc.stop(t0 + decay + 0.05);
  }
}

const BELL: [number, number][] = [
  [1, 0.6],
  [2, 0.2],
  [3, 0.08],
];
const BAR: [number, number][] = [
  [1, 0.7],
  [4, 0.12],
];

const PRESETS: Record<'dingdong' | 'chime' | 'xylophone', { notes: Note[]; partials: [number, number][] }> = {
  // 딩-동
  dingdong: {
    partials: BELL,
    notes: [
      { freq: 659.25, at: 0, decay: 1.2 },
      { freq: 523.25, at: 0.55, decay: 1.6 },
    ],
  },
  // 맑은 차임 (도-미-솔)
  chime: {
    partials: BELL,
    notes: [
      { freq: 1046.5, at: 0, decay: 1.4 },
      { freq: 1318.5, at: 0.2, decay: 1.4 },
      { freq: 1568.0, at: 0.4, decay: 1.8 },
    ],
  },
  // 실로폰 (도-미-솔-도)
  xylophone: {
    partials: BAR,
    notes: [
      { freq: 523.25, at: 0, decay: 0.5 },
      { freq: 659.25, at: 0.14, decay: 0.5 },
      { freq: 783.99, at: 0.28, decay: 0.5 },
      { freq: 1046.5, at: 0.42, decay: 0.9 },
    ],
  },
};

export async function playSound(payload: SoundPayload): Promise<void> {
  const ac = audio();
  const master = ac.createGain();
  master.gain.value = Math.min(1, Math.max(0, payload.volume));
  master.connect(ac.destination);

  if (payload.preset === 'custom' && payload.data) {
    try {
      // decodeAudioData는 버퍼를 소모하므로 복사본을 넘긴다.
      const buffer = await ac.decodeAudioData(payload.data.slice().buffer);
      const src = ac.createBufferSource();
      src.buffer = buffer;
      src.connect(master);
      src.start();
      return;
    } catch (err) {
      console.warn('알림음 파일을 재생하지 못해 기본 소리로 대신해요.', err);
    }
  }

  const preset = PRESETS[payload.preset === 'custom' ? 'dingdong' : payload.preset];
  for (const note of preset.notes) bell(ac, master, note, preset.partials);
}
