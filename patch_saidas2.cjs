const fs = require('fs');
const path = './src/pages/FinancasPessoais.jsx';
let content = fs.readFileSync(path, 'utf8');

const regexSaidas = /function Saidas\(\) \{([\s\S]*?)(?=\/\/ ─────────────────────────────────────────────\n\/\/ ABA EMPRESTIMOS)/;

const newSaidas = `function Saidas() {
  const [saidas, setSaidas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ descricao: "", valor: "", data: today(), categoria: "Contas Fixas" });
  const [recorrente, setRecorrente] = useState(false);
  const [qtdMeses, setQtdMeses] = useState(12);
  const [jaPago, setJaPago] = useState(false);
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7));
  const [categoriaFiltro, setCategoriaFiltro] = useState("Todas");
  
  // Controle de edição inline
  const [editValor, setEditValor] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("pessoal_saidas").select("*").order("data", { ascending: false });
    setSaidas(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saidasDoMes = saidas.filter((s) => s.data?.startsWith(mesFiltro));
  const saidasFiltradas = categoriaFiltro === "Todas" ? saidasDoMes : saidasDoMes.filter((s) => s.categoria === categoriaFiltro);
  
  // Totais agora só somam o que tem valor preenchido
  const totalMes = saidasDoMes.reduce((sum, s) => sum + parseN(s.valor), 0);
  const porCategoria = CATEGORIAS_SAIDA.map((cat) => ({ cat, total: saidasDoMes.filter((s) => s.categoria === cat).reduce((sum, s) => sum + parseN(s.valor), 0) })).filter((c) => c.total > 0);

  const handleSave = async () => {
    if (!form.descricao) return alert("A descrição é obrigatória.");
    const val = parseN(form.valor);
    const grupo_id = recorrente ? crypto.randomUUID() : null;
    
    if (recorrente && qtdMeses > 1) {
      const baseDate = new Date(form.data + "T12:00:00");
      const arr = [];
      for(let i=0; i < qtdMeses; i++) {
        const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
        arr.push({ 
          ...form, 
          valor: val > 0 ? val : null, 
          data: d.toISOString().split("T")[0],
          grupo_id,
          pago: i === 0 ? jaPago : false
        });
      }
      await supabase.from("pessoal_saidas").insert(arr);
    } else {
      await supabase.from("pessoal_saidas").insert([{ ...form, valor: val > 0 ? val : null, pago: jaPago, grupo_id }]);
    }
    
    setForm({ descricao: "", valor: "", data: today(), categoria: "Contas Fixas" });
    setRecorrente(false);
    setQtdMeses(12);
    setJaPago(false);
    load();
  };

  const handleDelete = async (s) => {
    if (s.grupo_id) {
      const delAll = window.confirm("Este é um lançamento recorrente.\\nDeseja excluir também todos os meses seguintes?\\n\\n[OK] = Excluir este e todos os futuros\\n[Cancelar] = Excluir APENAS este mês");
      if (delAll) {
        await supabase.from("pessoal_saidas").delete().eq("grupo_id", s.grupo_id).gte("data", s.data);
      } else {
        await supabase.from("pessoal_saidas").delete().eq("id", s.id);
      }
    } else {
      if (!window.confirm("Excluir esta saída?")) return;
      await supabase.from("pessoal_saidas").delete().eq("id", s.id);
    }
    load();
  };

  const handleUpdateValor = async (s, novoValorStr) => {
    const v = parseN(novoValorStr);
    if (v === s.valor) return; // Nao mudou
    await supabase.from("pessoal_saidas").update({ valor: v }).eq("id", s.id);
    setEditValor(p => ({...p, [s.id]: undefined}));
    load();
  };

  const togglePago = async (s) => {
    // Se esta pagando agora
    if (!s.pago) {
      const v = editValor[s.id] !== undefined ? parseN(editValor[s.id]) : parseN(s.valor);
      if (!v || v <= 0) {
        return alert("Preencha o valor da conta antes de marcar como paga.");
      }
      await supabase.from("pessoal_saidas").update({ pago: true, valor: v }).eq("id", s.id);
      setEditValor(p => ({...p, [s.id]: undefined}));
    } else {
      // Estornar
      await supabase.from("pessoal_saidas").update({ pago: false }).eq("id", s.id);
    }
    load();
  };

  return (
    <div className="fp-tab-content">
      <div className="fp-summary-cards">
        <div className="fp-card fp-card-red"><TrendingDown size={28} /><div><div className="fp-card-label">Total Saídas — {mesFiltro}</div><div className="fp-card-value">R$ {fmt(totalMes)}</div></div></div>
        {porCategoria.map(({ cat, total }) => (
          <div className="fp-card fp-card-mini" key={cat}><div className="fp-card-label">{cat}</div><div className="fp-card-value-sm">R$ {fmt(total)}</div></div>
        ))}
      </div>

      {/* Lançamento Rápido */}
      <div style={{ background: "var(--bg-surface)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--border-color)", marginBottom: "1.5rem", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
        <div style={{ fontWeight: 600, marginBottom: "0.75rem", fontSize: "0.95rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
          <TrendingDown size={18} style={{ color: "#EF4444" }}/> Lançamento Rápido
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{flex: 1, minWidth: "160px", fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500}}>
            Descrição *
            <input className="fp-input" value={form.descricao} onChange={e => setForm(p => ({...p, descricao: e.target.value}))} placeholder="Ex: Conta de Luz (CPFL)" />
          </label>
          <label style={{width: "120px", fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500}}>
            Valor (Opcional)
            <input className="fp-input" type="number" value={form.valor} onChange={e => setForm(p => ({...p, valor: e.target.value}))} placeholder="Deixe em branco" />
          </label>
          <label style={{width: "140px", fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500}}>
            Categoria *
            <select className="fp-input" value={form.categoria} onChange={e => setForm(p => ({...p, categoria: e.target.value}))}>
              {CATEGORIAS_SAIDA.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label style={{width: "130px", fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500}}>
            Data *
            <input className="fp-input" type="date" value={form.data} onChange={e => setForm(p => ({...p, data: e.target.value}))} />
          </label>
          <div style={{display: "flex", flexDirection: "column", gap: "8px", alignItems: "center"}}>
            <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={jaPago} onChange={e => setJaPago(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "#22C55E" }} />
              Já Pago?
            </label>
            <button className="fp-btn-danger" style={{height: "35px", padding: "0 1.25rem"}} onClick={handleSave}>
              <PlusCircle size={16} /> Lançar Saída
            </button>
          </div>
        </div>
        <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "1rem", fontSize: "0.85rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: "var(--text-primary)", fontWeight: 500 }}>
            <input type="checkbox" checked={recorrente} onChange={e => setRecorrente(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "#EF4444" }} />
            Gasto fixo (lançar para os meses seguintes)
          </label>
          {recorrente && (
            <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)", fontWeight: 500 }}>
              Gerar para
              <input className="fp-input" type="number" style={{ width: "60px", padding: "4px 8px", marginTop: 0 }} min="2" max="60" value={qtdMeses} onChange={e => setQtdMeses(parseInt(e.target.value))} />
              meses
            </label>
          )}
        </div>
      </div>

      <div className="fp-toolbar">
        <input type="month" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} className="fp-input" style={{width:"auto"}} />
        <select className="fp-input" style={{width:"auto"}} value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
          <option>Todas</option>
          {CATEGORIAS_SAIDA.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      
      {loading ? <p className="fp-loading">Carregando...</p> : (
        <table className="fp-table">
          <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style={{textAlign:"right", width:"140px"}}>Valor</th><th style={{textAlign:"center"}}>Status</th><th></th></tr></thead>
          <tbody>
            {saidasFiltradas.length === 0 && <tr><td colSpan={6} style={{textAlign:"center",color:"#888",padding:"2rem"}}>Nenhuma saída neste mês.</td></tr>}
            {saidasFiltradas.map((s) => {
              const isEditing = editValor[s.id] !== undefined;
              const curVal = isEditing ? editValor[s.id] : (s.valor || "");
              
              return (
                <tr key={s.id} className={s.pago ? "fp-row-done" : ""}>
                  <td>{fmtDate(s.data)}</td>
                  <td>
                    {s.descricao}
                    {s.grupo_id && <span style={{marginLeft:"6px", fontSize:"0.65rem", color:"#F97316", background:"#FFEDD5", padding:"2px 6px", borderRadius:"4px", fontWeight:600}}>Recorrente</span>}
                  </td>
                  <td><span className="fp-badge fp-badge-red">{s.categoria}</span></td>
                  <td style={{textAlign:"right",fontWeight:600,color:"#EF4444"}}>
                    {s.pago ? (
                      \`R$ \${fmt(s.valor)}\`
                    ) : (
                      <input 
                        type="number" 
                        className="fp-input" 
                        style={{width:"100px", padding:"6px", margin:0, display:"inline-block", textAlign:"right", borderColor:"#FCA5A5", background:"#FEF2F2"}} 
                        value={curVal} 
                        onChange={e => setEditValor(p => ({...p, [s.id]: e.target.value}))} 
                        onBlur={() => isEditing && handleUpdateValor(s, curVal)}
                        placeholder="R$ 0,00"
                      />
                    )}
                  </td>
                  <td style={{textAlign:"center"}}>
                    {s.pago ? (
                      <span className="fp-badge fp-badge-green"><CheckCircle size={11} /> Pago</span>
                    ) : (
                      <button className="fp-btn-sm fp-btn-green" onClick={() => togglePago(s)}><CheckCircle size={12} /> Pagar</button>
                    )}
                  </td>
                  <td style={{textAlign:"right"}}>
                    {s.pago && (
                      <button className="fp-icon-btn" title="Desfazer pagamento" style={{marginRight:"4px"}} onClick={() => togglePago(s)}>
                        <X size={14} />
                      </button>
                    )}
                    <button className="fp-icon-btn fp-icon-btn-danger" onClick={() => handleDelete(s)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
`

content = content.replace(regexSaidas, newSaidas);
fs.writeFileSync(path, content, 'utf8');
