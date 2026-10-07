import { EventEmitter } from 'node:events';
import { app, net, Notification, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { AppUpdateStatus } from '@shared/ipc';
import { appEdition } from './autoLaunch';

// 새 버전은 GitHub 릴리스에 올리고, 홈페이지는 GitHub Pages(docs/)에서 연다.
const OWNER = 'seoseo1234';
const REPO = 'scheduler';
export const DOWNLOAD_PAGE = `https://${OWNER}.github.io/${REPO}/`;

const FIRST_CHECK_DELAY = 30_000;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

/** "1.2.10" > "1.2.9" 처럼 숫자 단위로 비교한다. 접두어 v와 -beta 같은 꼬리는 무시. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('-')[0]!.split('.').map((n) => Number(n) || 0);
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** GitHub의 최신 릴리스 버전. 아직 릴리스가 없으면 null */
async function fetchLatestVersion(): Promise<string | null> {
  const res = await net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { tag_name?: string };
  return body.tag_name ? body.tag_name.replace(/^v/, '') : null;
}

/**
 * 프로그램 업데이트.
 * - 설치형: 새 버전을 백그라운드에서 내려받아 두고, 프로그램을 끌 때 설치한다.
 *   수업 중에 갑자기 다시 시작하지 않도록, 바로 설치는 선생님이 버튼을 누를 때만 한다.
 * - 무설치판·개발 실행: 스스로 설치할 수 없어 새 버전이 있다고 알리고 홈페이지로 안내한다.
 */
export class UpdateService extends EventEmitter<{ change: [AppUpdateStatus] }> {
  private status: AppUpdateStatus = { state: 'idle' };
  private readonly auto = appEdition() === 'installed';
  /** 같은 버전으로 알림을 여러 번 띄우지 않는다. */
  private notifiedVersion = '';

  constructor(private readonly onNotificationClick: () => void) {
    super();
    if (!this.auto) return;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }));
    autoUpdater.on('update-not-available', () => this.set({ state: 'latest', checkedAt: new Date().toISOString() }));
    autoUpdater.on('update-available', (info) => this.set({ state: 'downloading', version: info.version, percent: 0 }));
    autoUpdater.on('download-progress', (p) => {
      if (this.status.state === 'downloading') this.set({ ...this.status, percent: Math.floor(p.percent) });
    });
    autoUpdater.on('update-downloaded', (info) => {
      this.set({ state: 'downloaded', version: info.version });
      this.notify(info.version, '새 버전을 받아 두었어요. 프로그램을 끌 때 자동으로 설치돼요.');
    });
    autoUpdater.on('error', () =>
      this.set({ state: 'error', message: '업데이트를 확인하지 못했어요. 인터넷 연결을 확인하세요.' }),
    );
  }

  start(): void {
    setTimeout(() => void this.check(), FIRST_CHECK_DELAY).unref();
    setInterval(() => void this.check(), CHECK_INTERVAL).unref();
  }

  get(): AppUpdateStatus {
    return this.status;
  }

  async check(): Promise<void> {
    // 받는 중이거나 이미 받아 둔 업데이트가 있으면 다시 확인하지 않는다.
    if (['checking', 'downloading', 'downloaded'].includes(this.status.state)) return;
    if (this.auto) {
      // 결과와 오류는 autoUpdater 이벤트로 받는다.
      await autoUpdater.checkForUpdates().catch(() => {});
      return;
    }
    this.set({ state: 'checking' });
    try {
      const latest = await fetchLatestVersion();
      if (latest && isNewerVersion(latest, app.getVersion())) {
        this.set({ state: 'manual', version: latest });
        this.notify(latest, '홈페이지에서 새 버전을 내려받을 수 있어요.');
      } else {
        this.set({ state: 'latest', checkedAt: new Date().toISOString() });
      }
    } catch {
      this.set({ state: 'error', message: '업데이트를 확인하지 못했어요. 인터넷 연결을 확인하세요.' });
    }
  }

  /** 받아 둔 업데이트를 지금 설치하고 다시 시작한다. */
  install(): void {
    if (this.status.state === 'downloaded') autoUpdater.quitAndInstall(true, true);
  }

  openDownloadPage(): void {
    void shell.openExternal(DOWNLOAD_PAGE);
  }

  private set(next: AppUpdateStatus): void {
    this.status = next;
    this.emit('change', next);
  }

  private notify(version: string, body: string): void {
    if (this.notifiedVersion === version || !Notification.isSupported()) return;
    this.notifiedVersion = version;
    const n = new Notification({ title: `우리반 시계 v${version} 업데이트`, body });
    n.on('click', this.onNotificationClick);
    n.show();
  }
}
