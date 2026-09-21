import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import '@fontsource/montserrat/latin-400.css';
import '@fontsource/montserrat/latin-600.css';
import './styles/app.less';
import './styles/bot-game.less';
import { AuthProvider } from './auth/AuthContext';
import { SiteSettingsProvider } from './settings/SiteSettingsContext';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider><SiteSettingsProvider><App /></SiteSettingsProvider></AuthProvider>
    </HashRouter>
  </StrictMode>
);
