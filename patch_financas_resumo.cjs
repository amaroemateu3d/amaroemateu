const fs = require('fs');
const path = './src/pages/FinancasPessoais.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Modificar Emprestimos para aceitar 'tipo'
content = content.replace(/function Emprestimos\(\) \{/, 'function Emprestimos({ tipo = "bancario" }) {');
content = content.replace(
  /const { data: emp } = await supabase\.from\("emprestimos"\)\.select\("\*"\)\.order\("data_contratacao"\);/,
  'const { data: emp } = await supabase.from("emprestimos").select("*").eq("categoria", tipo).order("data_contratacao");'
);
content = content.replace(
  /status: "ativo"/,
  'status: "ativo", categoria: tipo'
);

// 2. Adicionar aba Resumo e abas extras no main component
const mainComponent = `
function Resumo() {
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7));
  const [entradas, setEntradas] = useState([]);
  const [saidas, setSaidas] = useState([]);
  const [parcelas, setParcelas] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Buscar entradas do mes
    const { data: dEntradas } = await supabase.from("pessoal_entradas").select("*").like("data", \`\${mesFiltro}%\`);
    // Buscar saidas do mes
    const { data: dSaidas } = await supabase.from("pessoal_saidas").select("*").like("data", \`\${mesFiltro}%\`);
    // Buscar parcelas do mes
    const { data: dParcelas } = await supabase.from("emprestimo_parcelas").select("*, emprestimos(credor)").like("data_vencimento", \`\${mesFiltro}%\`);
    
    setEntradas(dEntradas || []);
    setSaidas(dSaidas || []);
    setParcelas(dParcelas || []);
    setLoading(false);
  }, [mesFiltro]);

  useEffect(() => { load(); }, [load]);

  const totalEntradas = entradas.reduce((s, e) => s + parseN(e.valor), 0);
  const totalSaidas = saidas.reduce((s, e) => s + parseN(e.valor), 0);
  const totalParcelas = parcelas.reduce((s, p) => s + parseN(p.valor_parcela), 0);
  const saldoLivre = totalEntradas - totalSaidas - totalParcelas;

  // Juntar tudo numa linha do tempo
  const timeline = [
    ...entradas.map(e => ({ id: "e"+e.id, data: e.data, desc: e.descricao, valor: parseN(e.valor), tipo: "entrada", status: "ok" })),
    ...saidas.map(s => ({ id: "s"+s.id, data: s.data, desc: s.descricao, valor: parseN(s.valor), tipo: "saida", status: s.pago ? "ok" : "pendente" })),
    ...parcelas.map(p => ({ id: "p"+p.id, data: p.data_vencimento, desc: \`Parcela \${p.numero_parcela} - \${p.emprestimos?.credor}\`, valor: parseN(p.valor_parcela), tipo: "parcela", status: p.status }))
  ].sort((a,b) => new Date(a.data) - new Date(b.data));

  return (
    <div className="fp-tab-content">
      <div className="fp-summary-cards">
        <div className="fp-card fp-card-green"><TrendingUp size={24}/><div><div className="fp-card-label">Entradas</div><div className="fp-card-value-sm">R$ {fmt(totalEntradas)}</div></div></div>
        <div className="fp-card fp-card-red"><TrendingDown size={24}/><div><div className="fp-card-label">Saídas</div><div className="fp-card-value-sm">R$ {fmt(totalSaidas)}</div></div></div>
        <div className="fp-card fp-card-orange"><CreditCard size={24}/><div><div className="fp-card-label">Empréstimos</div><div className="fp-card-value-sm">R$ {fmt(totalParcelas)}</div></div></div>
        <div className="fp-card"><div className="fp-card-label" style={{color: saldoLivre >= 0 ? "#10B981" : "#EF4444", fontSize: "1.2rem", fontWeight: 700}}>Saldo: R$ {fmt(saldoLivre)}</div></div>
      </div>
      <div className="fp-toolbar">
        <input type="month" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} className="fp-input" style={{width:"auto"}} />
      </div>
      {loading ? <p className="fp-loading">Carregando...</p> : (
        <table className="fp-table">
          <thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th style={{textAlign:"right"}}>Valor</th></tr></thead>
          <tbody>
            {timeline.length === 0 && <tr><td colSpan={4} style={{textAlign:"center", color:"#888"}}>Nenhuma movimentação.</td></tr>}
            {timeline.map(t => (
              <tr key={t.id}>
                <td>{fmtDate(t.data)}</td>
                <td>{t.desc}</td>
                <td>
                  {t.tipo === 'entrada' && <span className="fp-badge fp-badge-green">Entrada</span>}
                  {t.tipo === 'saida' && <span className="fp-badge fp-badge-red">Saída {t.status === 'pendente' && '(Pendente)'}</span>}
                  {t.tipo === 'parcela' && <span className="fp-badge fp-badge-orange">Empréstimo {t.status !== 'pago' && '(Pendente)'}</span>}
                </td>
                <td style={{textAlign:"right", fontWeight: 600, color: t.tipo === 'entrada' ? "#10B981" : "#EF4444"}}>
                  {t.tipo === 'entrada' ? '+' : '-'} R$ {fmt(t.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function FinancasPessoais() {
  const [aba, setAba] = useState("resumo");
  return (
    <div className="fp-container">
      <div className="fp-header">
        <h1>Finanças Pessoais</h1>
        <p className="fp-subtitle">Controle privado de Daniel & Cintia - separado da empresa</p>
      </div>
      <div className="fp-tabs" style={{display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "10px"}}>
        <button className={\`fp-tab \${aba === "resumo" ? "fp-tab-active" : ""}\`} onClick={() => setAba("resumo")}><Calendar size={16} /> Resumo</button>
        <button className={\`fp-tab \${aba === "entradas" ? "fp-tab-active fp-tab-green" : ""}\`} onClick={() => setAba("entradas")}><TrendingUp size={16} /> Entradas</button>
        <button className={\`fp-tab \${aba === "saidas" ? "fp-tab-active fp-tab-red" : ""}\`} onClick={() => setAba("saidas")}><TrendingDown size={16} /> Saídas</button>
        <button className={\`fp-tab \${aba === "bancarios" ? "fp-tab-active fp-tab-orange" : ""}\`} onClick={() => setAba("bancarios")}><CreditCard size={16} /> Bancários</button>
        <button className={\`fp-tab \${aba === "pessoais" ? "fp-tab-active fp-tab-orange" : ""}\`} onClick={() => setAba("pessoais")}><CreditCard size={16} /> Pessoais</button>
      </div>
      {aba === "resumo" && <Resumo />}
      {aba === "entradas" && <Entradas />}
      {aba === "saidas" && <Saidas />}
      {aba === "bancarios" && <Emprestimos tipo="bancario" />}
      {aba === "pessoais" && <Emprestimos tipo="pessoal" />}
    </div>
  );
}
`;

content = content.replace(/export default function FinancasPessoais\(\) \{[\s\S]*$/, mainComponent);
fs.writeFileSync(path, content, 'utf8');
