import { createRoot } from 'react-dom/client';
import type { TeacherApi } from '@shared/api';
import '../common/widget.css';
import './teacher.css';
import { TeacherWidget } from './TeacherWidget';

const api = window.api as TeacherApi;
createRoot(document.getElementById('root')!).render(<TeacherWidget api={api} />);
