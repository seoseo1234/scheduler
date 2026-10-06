/// <reference types="vite/client" />
import type { SettingsApi, StudentApi, TeacherApi } from '@shared/api';

declare global {
  interface Window {
    // 각 창의 preload가 자기 API만 노출한다. 페이지별로 알맞은 타입으로 좁혀 쓴다.
    api: unknown;
  }
}

export type { SettingsApi, StudentApi, TeacherApi };
