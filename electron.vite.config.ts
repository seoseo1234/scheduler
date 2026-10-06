import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const shared = { '@shared': resolve(__dirname, 'src/shared') };

export default defineConfig({
  main: {
    resolve: { alias: shared },
  },
  preload: {
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        // 창마다 별도 preload: 학생 창에는 교사 데이터 채널이 아예 노출되지 않도록 분리한다.
        input: {
          student: resolve(__dirname, 'src/preload/student.ts'),
          teacher: resolve(__dirname, 'src/preload/teacher.ts'),
          settings: resolve(__dirname, 'src/preload/settings.ts'),
          overlay: resolve(__dirname, 'src/preload/overlay.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: {
          student: resolve(__dirname, 'src/renderer/student.html'),
          teacher: resolve(__dirname, 'src/renderer/teacher.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html'),
          identify: resolve(__dirname, 'src/renderer/identify.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay.html'),
        },
      },
    },
  },
});
