import { EventEmitter } from 'node:events';
import { net, powerMonitor, safeStorage } from 'electron';
import Store from 'electron-store';
import { parseGoogleResponse, taskListNames } from '@shared/google';
import type { GoogleData, GoogleSnapshot, GoogleStatus, GoogleTask } from '@shared/types';
import type { ConnectionTestResult, GoogleInfo, TaskAction, TaskActionResult } from '@shared/ipc';
import type { SettingsStore } from './store';

const FETCH_TIMEOUT_MS = 20_000;
const NO_WRITE_PERMISSION_MESSAGE =
  '구글이 할 일을 바꿀 권한을 아직 주지 않았어요. Apps Script 편집기 위쪽 함수 목록에서 doGet을 고르고 ▶ 실행 → 권한 검토 → 허용을 눌러 주세요.';
const OLD_SCRIPT_MESSAGE =
  "할 일을 완료·수정·삭제하려면 설정 → 구글 연동에서 Apps Script 코드를 다시 복사해 붙여넣고, 배포 관리에서 새 버전으로 배포해 주세요.";

class GoogleFetchError extends Error {}

/**
 * Apps Script 웹 앱에서 교사의 캘린더·할 일을 받아온다.
 * - 토큰은 safeStorage(Windows DPAPI)로 암호화해 설정과 별도 파일에 저장한다.
 * - 마지막으로 받은 데이터를 캐시해 오프라인일 때 보여준다.
 * - 이 데이터는 교사 위젯으로만 보낸다 ('change' 이벤트 구독자는 교사 창 하나).
 */
export class GoogleService extends EventEmitter<{ change: [GoogleSnapshot] }> {
  private readonly secrets = new Store<{ token?: string }>({ name: 'secrets' });
  private readonly cache = new Store<{ data?: GoogleData; lastSync?: string }>({ name: 'google-cache' });
  private status: GoogleStatus;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | null = null;

  constructor(private readonly store: SettingsStore) {
    super();
    this.status = { state: 'notConfigured', lastSync: this.cache.get('lastSync') ?? null, message: null };
    store.on('change', (next, prev) => {
      if (next.google !== prev.google) {
        // URL·범위가 바뀌면 바로 다시 받고, 주기가 바뀌면 타이머를 새로 맞춘다.
        const g = next.google;
        const p = prev.google;
        if (g.webAppUrl !== p.webAppUrl || g.days !== p.days) void this.refresh();
        else if (g.refreshMinutes !== p.refreshMinutes) this.schedule();
      }
    });
  }

  start(): void {
    powerMonitor.on('resume', () => void this.refresh());
    void this.refresh();
  }

  snapshot(): GoogleSnapshot {
    return { data: this.cache.get('data') ?? null, status: this.status };
  }

  info(): GoogleInfo {
    // 다른 PC에서 복사해 온 설정처럼 풀 수 없는 토큰은 없는 것으로 본다.
    return { hasToken: this.getToken() !== null, status: this.status, lists: taskListNames(this.cache.get('data')?.tasks ?? []) };
  }

  setToken(token: string): void {
    const trimmed = token.trim();
    if (!trimmed) this.secrets.delete('token');
    else if (safeStorage.isEncryptionAvailable())
      this.secrets.set('token', `enc:${safeStorage.encryptString(trimmed).toString('base64')}`);
    else throw new Error('이 PC에서 토큰을 안전하게 저장할 수 없어요.');
    void this.refresh();
  }

  private getToken(): string | null {
    const raw = this.secrets.get('token');
    if (!raw?.startsWith('enc:')) return null;
    try {
      return safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64'));
    } catch {
      return null;
    }
  }

  /** 지금 다시 받기. 진행 중이면 그 결과를 기다린다. */
  refresh(): Promise<void> {
    this.inFlight ??= this.doRefresh().finally(() => {
      this.inFlight = null;
      this.schedule();
    });
    return this.inFlight;
  }

  /** 설정 화면 "연결 테스트": 저장 전 URL/토큰으로 시험한다. 토큰을 비우면 저장된 토큰 사용. */
  async test(url: string, token: string): Promise<ConnectionTestResult> {
    const useToken = token.trim() || this.getToken();
    if (!url.trim()) return { ok: false, message: '웹 앱 URL을 입력하세요.' };
    if (!useToken) return { ok: false, message: '토큰을 입력하세요.' };
    try {
      const data = await this.fetchData(url.trim(), useToken, this.store.get().google.days);
      return {
        ok: true,
        message: `연결됐어요! 일정 ${data.events.length}개, 할 일 ${data.tasks.length}개를 받았어요.`,
        events: data.events.length,
        tasks: data.tasks.length,
        lists: taskListNames(data.tasks),
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  private schedule(): void {
    clearTimeout(this.timer);
    const minutes = Math.max(1, this.store.get().google.refreshMinutes || 5);
    this.timer = setTimeout(() => void this.refresh(), minutes * 60_000);
  }

  private setStatus(status: GoogleStatus): void {
    this.status = status;
    this.emit('change', this.snapshot());
  }

  private async doRefresh(): Promise<void> {
    const { google } = this.store.get();
    const token = this.getToken();
    const lastSync = this.cache.get('lastSync') ?? null;
    if (!google.webAppUrl || !token) {
      this.setStatus({ state: 'notConfigured', lastSync, message: '설정 → 구글 연동에서 연결해 주세요.' });
      return;
    }
    this.setStatus({ ...this.status, state: 'loading' });
    try {
      const data = await this.fetchData(google.webAppUrl, token, google.days);
      const now = new Date().toISOString();
      this.cache.set({ data, lastSync: now });
      this.setStatus({ state: 'ok', lastSync: now, message: null });
    } catch (err) {
      const offline = !net.isOnline();
      this.setStatus({
        state: offline ? 'offline' : 'error',
        lastSync,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** 교사 위젯에서 할 일을 완료·수정·삭제한다. 성공하면 화면에 바로 반영하고 구글에서 다시 받아 맞춘다. */
  async taskAction(action: TaskAction): Promise<TaskActionResult> {
    const { google } = this.store.get();
    const token = this.getToken();
    if (!google.webAppUrl || !token) return { ok: false, message: '구글 연동이 설정되지 않았어요.' };
    if (!action.listId) return { ok: false, message: OLD_SCRIPT_MESSAGE };
    try {
      const json = (await this.request(google.webAppUrl, token, { body: action })) as { ok?: boolean; error?: string; message?: string };
      if (json.error === 'unauthorized') return { ok: false, message: '토큰이 일치하지 않아요. 스크립트 속성의 TOKEN 값과 같은지 확인하세요.' };
      // 처음에 할 일을 "읽기"만 허용했으면 바꾸기 권한(auth/tasks)이 없어 구글이 거절한다.
      if (json.error && /auth\/tasks|권한|permission/i.test(json.message ?? '')) return { ok: false, message: NO_WRITE_PERMISSION_MESSAGE };
      if (json.error) return { ok: false, message: `할 일을 바꾸지 못했어요: ${json.message ?? json.error}` };
      if (json.ok !== true) return { ok: false, message: OLD_SCRIPT_MESSAGE };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
    this.applyLocally(action);
    void this.refresh();
    return { ok: true };
  }

  private applyLocally(action: TaskAction): void {
    const data = this.cache.get('data');
    if (!data) return;
    const same = (t: GoogleTask) => t.id === action.taskId && t.listId === action.listId;
    const tasks =
      action.action === 'update'
        ? data.tasks.map((t) => (same(t) ? { ...t, title: action.title.trim() || t.title, due: action.due, notes: action.notes } : t))
        : data.tasks.filter((t) => !same(t));
    this.cache.set('data', { ...data, tasks });
    this.emit('change', this.snapshot());
  }

  private async fetchData(url: string, token: string, days: number): Promise<GoogleData> {
    const result = parseGoogleResponse(await this.request(url, token, { days }));
    if (result.ok) return result.data;
    switch (result.code) {
      case 'unauthorized':
        throw new GoogleFetchError('토큰이 일치하지 않아요. 스크립트 속성의 TOKEN 값과 같은지 확인하세요.');
      case 'scriptError':
        throw new GoogleFetchError(
          `Apps Script 실행 중 오류가 났어요: ${result.message ?? ''}. "서비스"에 Tasks API를 추가했는지 확인하세요.`,
        );
      default:
        throw new GoogleFetchError('응답 형식이 올바르지 않아요. Apps Script 코드를 다시 붙여넣고 새로 배포해 주세요.');
    }
  }

  /**
   * 웹 앱에 요청해 JSON을 받는다.
   * body가 없으면 GET으로 데이터를 받고, 있으면 POST로 할 일을 바꾼다 (토큰은 URL이 아니라 본문에 넣는다).
   */
  private async request(url: string, token: string, opts: { days?: number; body?: object }): Promise<unknown> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new GoogleFetchError('웹 앱 URL 형식이 올바르지 않아요. https://script.google.com/… 주소를 붙여넣으세요.');
    }
    // 개발·테스트용 로컬 서버만 http를 허용한다.
    const local = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !local) throw new GoogleFetchError('웹 앱 URL은 https:// 로 시작해야 해요.');
    const init: RequestInit = { redirect: 'follow' };
    if (opts.body) {
      init.method = 'POST';
      // Apps Script는 text/plain 본문을 그대로 e.postData.contents로 준다.
      init.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      init.body = JSON.stringify({ token, ...opts.body });
    } else {
      parsed.searchParams.set('token', token);
      parsed.searchParams.set('days', String(opts.days ?? 7));
    }

    if (!local && !net.isOnline()) throw new GoogleFetchError('인터넷에 연결되어 있지 않아요.');

    let res: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      res = await net.fetch(parsed.toString(), { ...init, signal: controller.signal });
    } catch {
      throw new GoogleFetchError(
        'script.google.com에 접속하지 못했어요. 인터넷 연결을 확인하고, 학교망 방화벽이 script.google.com을 막고 있는지 정보 담당 선생님께 확인해 주세요.',
      );
    } finally {
      clearTimeout(timeout);
    }

    const body = await res.text();
    // 예전 코드에는 doPost가 없어 구글이 오류 페이지(HTML)를 돌려준다.
    if (opts.body && /^\s*</.test(body) && /doPost/.test(body)) throw new GoogleFetchError(OLD_SCRIPT_MESSAGE);
    if (res.status === 401 || res.status === 403 || res.status === 404 || /^\s*</.test(body)) {
      throw new GoogleFetchError(
        "웹 앱에 접근할 수 없어요. 배포할 때 '실행 사용자: 나', '액세스 권한: 모든 사용자'로 했는지, URL이 /exec로 끝나는지 확인하세요.",
      );
    }
    if (!res.ok) throw new GoogleFetchError(`구글 서버 오류가 났어요 (HTTP ${res.status}). 잠시 뒤 다시 시도해 주세요.`);

    try {
      return JSON.parse(body);
    } catch {
      throw new GoogleFetchError('응답 형식이 올바르지 않아요. Apps Script 코드를 다시 붙여넣고 새로 배포해 주세요.');
    }
  }
}
