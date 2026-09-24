import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AppHeader } from './components/AppHeader';
import { AuthProvider } from './auth/AuthContext';
import { SiteSettingsProvider } from './settings/SiteSettingsContext';
import { InstallProvider } from './pwa/InstallContext';

const root = document.getElementById('shared-site-header');
if (root) {
  const clientBase = root.dataset.clientBase!;
  createRoot(root).render(<MemoryRouter initialEntries={['/starter-decks']}><InstallProvider assetBase={clientBase + 'brand/'}><AuthProvider><SiteSettingsProvider><AppHeader clientBase={clientBase} starterActive /></SiteSettingsProvider></AuthProvider></InstallProvider></MemoryRouter>);
}
