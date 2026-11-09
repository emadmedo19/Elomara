import { clearNativeWebAppCache, registerWebAppWorker } from './services/webAppCache';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext';
import { PushNotificationManager } from './components/PushNotificationManager';
import './index.css';
import { initializeLiveUpdates } from './services/otaUpdates';
import { OtaUpdateNotice } from './components/OtaUpdateNotice';

void clearNativeWebAppCache().catch(error => console.warn('[OTA] Web cache cleanup failed', error));
registerWebAppWorker();
initializeLiveUpdates();

createRoot(document.getElementById('root')!).render(
  <>
    <OtaUpdateNotice />
    <AuthProvider>
      <PushNotificationManager />
      <App />
    </AuthProvider>
  </>
);
