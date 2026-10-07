import { createRoot } from 'react-dom/client';
import type { SettingsApi } from '@shared/api';
import '@fontsource/jua';
import './settings.css';
import { SettingsApp } from './SettingsApp';

const api = window.api as SettingsApi;
createRoot(document.getElementById('root')!).render(<SettingsApp api={api} />);
