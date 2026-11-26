import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {installWakeLockPolicyGuard} from './emulator/core/wakeLockGuard';
import './index.css';

installWakeLockPolicyGuard();

createRoot(document.getElementById('root')!).render(<App />);
