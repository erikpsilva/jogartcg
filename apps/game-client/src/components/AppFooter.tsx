import { Link } from 'react-router-dom';
import { useSiteSettings } from '../settings/SiteSettingsContext';
import { useInstallApp } from '../pwa/InstallContext';

export function AppFooter() {
  const { playEnabled } = useSiteSettings();
  const { showInstallSuggestion } = useInstallApp();
  return (
    <footer className="site-footer">
      <div className="site-footer__grid">
        <div className="site-footer__brand">
          <Link className="brand" to="/cartas">
            <img src="./brand/logo-jogar-tcg.png" alt="Jogar TCG" />
          </Link>
          <p>Consulte cartas, monte seus decks e prepare-se para jogar em qualquer dispositivo.</p>
        </div>

        <div>
          <strong>Plataforma</strong>
          <Link to="/cartas">Catálogo</Link>
          <Link to="/decks">Montar deck</Link>
          {playEnabled && <Link to="/jogar" onClick={showInstallSuggestion}>Mesa de jogo</Link>}
        </div>

        <div>
          <strong>Conta</strong>
          <Link to="/entrar">Entrar</Link>
          <Link to="/cadastro">Criar conta</Link>
          <span>Web · Android · iOS</span>
        </div>
      </div>

      <div className="site-footer__legal">
        <span>© {new Date().getFullYear()} Jogar TCG</span>
        <p>Projeto independente. Disney Lorcana e suas imagens pertencem aos respectivos titulares.</p>
      </div>
    </footer>
  );
}
