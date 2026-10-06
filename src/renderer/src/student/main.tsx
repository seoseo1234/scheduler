import { createRoot } from 'react-dom/client';
import type { StudentApi } from '@shared/api';
import '../common/widget.css';
import './student.css';
import { StudentWidget } from './StudentWidget';

const api = window.api as StudentApi;
createRoot(document.getElementById('root')!).render(<StudentWidget api={api} />);
