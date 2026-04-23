export default function Dashboard() {
  return (
    <div className="page-wrapper">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-description">Visão geral da produção e orçamentos.</p>
      
      <div className="grid-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem'}}>
        <div className="card">
          <h3>Projetos em Andamento</h3>
          <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)'}}>2 projetos ativos</p>
        </div>
        <div className="card">
          <h3>Orçamentos do Mês</h3>
          <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)'}}>5 enviados</p>
        </div>
      </div>
    </div>
  );
}
