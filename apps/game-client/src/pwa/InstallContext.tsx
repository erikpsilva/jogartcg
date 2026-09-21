import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallContextValue {
  installed: boolean;
  showInstallSuggestion(): void;
}

const InstallContext = createContext<InstallContextValue | null>(null);

function runsStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function InstallProvider({ children }: { children: ReactNode }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(runsStandalone);
  const [open, setOpen] = useState(false);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setOpen(false); setPromptEvent(null); };
    const onDisplayChange = () => setInstalled(runsStandalone());
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    displayMode.addEventListener('change', onDisplayChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      displayMode.removeEventListener('change', onDisplayChange);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') setOpen(false);
    setPromptEvent(null);
  }

  const value = useMemo<InstallContextValue>(() => ({
    installed,
    showInstallSuggestion: () => { if (!installed) setOpen(true); },
  }), [installed]);

  return <InstallContext.Provider value={value}>{children}
    {open && !installed && <div className="install-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="install-title">
        <button className="install-dialog__close" type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
        <img src="./brand/favicon.png" alt="" />
        <div><span>Jogar TCG</span><h2 id="install-title">Instale o aplicativo</h2></div>
        <p>Abra o Jogar TCG em tela cheia, sem a barra do navegador, e tenha acesso rápido pelo celular.</p>
        {promptEvent ? <button className="button button--primary" type="button" onClick={() => void install()}>Instalar agora</button>
          : isIos ? <p className="install-dialog__tip">No Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</p>
            : <p className="install-dialog__tip">Abra o menu do navegador e escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</p>}
      </section>
    </div>}
  </InstallContext.Provider>;
}

export function useInstallApp() {
  const context = useContext(InstallContext);
  if (!context) throw new Error('useInstallApp deve ser usado dentro de InstallProvider.');
  return context;
}
