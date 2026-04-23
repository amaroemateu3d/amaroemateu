export default function FtResults({ results, inputs }) {
  const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  const qtd = Math.max(1, Number(inputs.quantidade) || 1);

  // Extras individuais para exibição
  const extras = [1, 2, 3].map(i => ({
    nome:  inputs[`extraNome${i}`]  || `Extra ${i}`,
    valor: Number(inputs[`extraValor${i}`]) || 0,
  })).filter(e => e.valor > 0);

  return (
    <div className="results-container">
      <div className="card sticky-card">
        
        <div className="results-header">
          <div>
            <span className="badge">{inputs.indiceFt || 'FT-XX'}</span>
            <h2 style={{marginTop: '0.2rem', fontSize: '1.2rem'}}>{inputs.nomePeca || 'Nova Peça'}</h2>
          </div>
        </div>

        {/* Custo do lote (material + energia + máquina — SEM extras) */}
        <div className="price-highlight" style={{background: 'var(--bg-surface-hover)'}}>
          <span className="label">Custo Unitário Total de Produção</span>
          <h2 className="big-price" style={{color: 'var(--text-primary)'}}>
            {formatCurrency(results.custoFisicoUnit)}
          </h2>
        </div>

        <div className="divider" />

        <div className="costs-breakdown">
          <h4>Detalhamento — Custo por Unidade</h4>
          <ul>
            {/* Custos de lote ÷ quantidade */}
            <li>
              <span>
                <span className="dot material"></span>
                Material ({(((inputs.pesoGramas || 0) / qtd)).toFixed(1)}g/un)
              </span>
              <span>{formatCurrency(results.custoMaterialUnit)}</span>
            </li>
            <li>
              <span>
                <span className="dot energy" style={{backgroundColor: '#EAB308'}}></span>
                Energia
              </span>
              <span>{formatCurrency(results.custoEnergiaUnit)}</span>
            </li>
            <li>
              <span>
                <span className="dot" style={{backgroundColor: '#F97316', width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', marginRight: '8px'}}></span>
                Máquina (Deprec.)
              </span>
              <span>{formatCurrency(results.custoMaquinaUnit)}</span>
            </li>

            {/* Gastos extras — já são por unidade, não dividem pelo lote */}
            {extras.map((e, i) => (
              <li key={i}>
                <span>
                  <span style={{display:'inline-block', width:'8px', height:'8px', borderRadius:'50%', background:'#D97706', marginRight:'8px'}}></span>
                  {e.nome}
                  <span style={{fontSize:'0.72rem', color:'var(--text-secondary)', marginLeft:'5px'}}>(por un)</span>
                </span>
                <span>{formatCurrency(e.valor)}</span>
              </li>
            ))}
          </ul>

          {/* Total unitário = lote/qtd + extras */}
          <div className="total-cost" style={{borderColor: 'var(--accent-subtle)'}}>
            <span style={{color: 'var(--accent-primary)', fontWeight: 'bold'}}>Custo Físico Unitário</span>
            <strong style={{color: 'var(--accent-primary)', fontSize: '1.4rem'}}>
              {formatCurrency(results.custoFisicoUnit)}
            </strong>
          </div>

          {/* Prova do cálculo */}
          {extras.length > 0 && (
            <div style={{
              marginTop: '0.6rem',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              background: 'var(--bg-primary)',
              borderRadius: '6px',
              padding: '0.5rem 0.75rem',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>Produção (Maq + Mat + Eng ÷ {qtd} un)</span>
              <span>{formatCurrency(results.custoMaterialUnit + results.custoEnergiaUnit + results.custoMaquinaUnit)}</span>
            </div>
          )}
          {extras.length > 0 && (
            <div style={{
              marginTop: '3px',
              fontSize: '0.75rem',
              color: '#D97706',
              background: '#FEF9EE',
              borderRadius: '6px',
              padding: '0.5rem 0.75rem',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>+ Gastos Extras (por unidade)</span>
              <span>+ {formatCurrency(results.custosExtrasAdic)}</span>
            </div>
          )}

          <p style={{fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '1rem', textAlign: 'center'}}>
            Envios, Taxas, Embalagens e Impostos são controlados na aba "Vendas Multi-Canal".
          </p>
        </div>
        
      </div>
    </div>
  );
}
