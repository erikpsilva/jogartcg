import { useAuth } from '../auth/AuthContext';
import { WalletIndicators } from '../components/Shop';

// Todos possuem o personagem inicial. O inventário de novos personagens será
// integrado quando houver outros personagens disponíveis para aquisição.
export function CharactersPage() {
  const { user } = useAuth();
  return <div className="page-container characters-page">
    <header className="builder-heading"><div><span className="eyebrow">Sua coleção · Personagens</span><h1>Meus personagens.</h1><p>{user?.nome}, escolha quem acompanha você na aventura.</p></div><WalletIndicators /></header>
    <section className="character-showcase" aria-label="Personagem equipado">
      <div className="character-stage"><img src="./adventure/mickey-idle.gif" alt="Mickey cavaleiro, personagem inicial, respirando em posição de espera" /></div>
      <div className="character-description"><span className="eyebrow">Inicial · Disponível para todos</span><h2>Mickey Knight</h2><p>Seu primeiro companheiro na jornada pelas histórias. Todo jogador começa com o Mickey em sua coleção.</p><span className="character-equipped">✓ Equipado na aventura</span><p className="character-note">Novos personagens chegarão à coleção. Quando disponíveis, você poderá escolher entre os personagens que possui.</p></div>
    </section>
    <section className="character-collection" aria-label="Sua coleção"><h2>Sua coleção <small>1 personagem</small></h2><button className="character-tile" aria-pressed="true" aria-label="Mickey Knight, equipado"><img src="./adventure/mickey-idle.gif" alt="" /><strong>Mickey Knight</strong><span>✓ Equipado</span></button></section>
  </div>;
}
