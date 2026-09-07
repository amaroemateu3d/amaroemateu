const fs = require('fs');
const path = './src/pages/FinancasPessoais.jsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /function ParcelasModal\(\{ emprestimo, onClose, onUpdate \}\) \{([\s\S]*?)function Resumo\(\) \{/;

const newCode = `function ParcelasModal({ emprestimo, onClose, onUpdate }) {
  const [parcelas, setParcelas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todas");
  const [novoPgto, setNovoPgto] = useState({ data: today(), valor: "" });
  
  const isFlexivel = emprestimo.quantidade_parcelas === 0;

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("emprestimo_parcelas")
      .select("*")
      .eq("emprestimo_id", emprestimo.id)
      .order(isFlexivel ? "data_pagamento" : "numero_parcela", { ascending: !isFlexivel });
    setParcelas(data || []);
    setLoading(false);
  }, [emprestimo.id, isFlexivel]);

  useEffect(() => { load(); }, [load]);

  const handlePagar = async (parcela) => {
    if (!window.confirm(\`Marcar parcela \${parcela.numero_parcela} como PAGA?\`)) return;
    await supabase.from("emprestimo_parcelas")
      .update({ status: "pago", data_pagamento: today() })
      .eq("id", parcela.id);
    load();
    onUpdate();
  };

  const handleEstornar = async (parcela) => {
    if (!window.confirm(\`Estornar pagamento?\`)) return;
    if (isFlexivel) {
      // Se for flexivel, estornar significa apagar o registro
      await supabase.from("emprestimo_parcelas").delete().eq("id", parcela.id);
    } else {
      await supabase.from("emprestimo_parcelas")
        .update({ status: "pendente", data_pagamento: null })
        .eq("id", parcela.id);
    }
    load();
    onUpdate();
  };

  const handleAddPgto = async () => {
    if (!novoPgto.valor) return alert("Preencha o valor do pagamento.");
    await supabase.from("emprestimo_parcelas").insert([{
      emprestimo_id: emprestimo.id,
      numero_parcela: parcelas.length + 1,
      valor_parcela: parseN(novoPgto.valor),
      data_vencimento: novoPgto.data,
      data_pagamento: novoPgto.data,
      status: "pago"
    }]);
    setNovoPgto({ data: today(), valor: "" });
    load();
    onUpdate();
  };

  const hojeCalc = today();
  const calcSt = (p) => p.status === "pago" ? "pago" : (p.data_vencimento < hojeCalc ? "atrasado" : "pendente");
  
  const pagas = parcelas.filter(p => p.status === "pago").length;
  const atrasadas = parcelas.filter(p => calcSt(p) === "atrasado").length;
  const pendentes = parcelas.filter(p => calcSt(p) === "pendente").length;
  
  const totalPagoVal = parcelas.filter(p => p.status === "pago").reduce((s, p) => s + parseN(p.valor_parcela), 0);
  const financed = parseN(emprestimo.valor_total_financiado);
  const pct = isFlexivel ? (financed > 0 ? Math.min(Math.round((totalPagoVal / financed) * 100), 100) : 0) : (parcelas.length > 0 ? Math.round((pagas / parcelas.length) * 100) : 0);

  const listaFiltrada = isFlexivel ? parcelas : (
    filtro === "todas" ? parcelas :
    filtro === "pagas" ? parcelas.filter(p => p.status === "pago") :
    filtro === "atrasadas" ? parcelas.filter(p => calcSt(p) === "atrasado") :
    parcelas.filter(p => calcSt(p) === "pendente")
  );

  const statusBadge = (p) => {
    const s = calcSt(p);
    if (s === "pago") return <span className="fp-badge fp-badge-green"><CheckCircle size={11} /> Pago</span>;
    if (s === "atrasado") return <span className="fp-badge fp-badge-red"><AlertCircle size={11} /> Atrasado</span>;
    return <span className="fp-badge fp-badge-orange">Pendente</span>;
  };

  return (
    <ModalBase title={isFlexivel ? \`Pagamentos — \${emprestimo.credor}\` : \`Parcelas — \${emprestimo.credor}\`} onClose={onClose} wide>
      <div style={{marginBottom:"1rem"}}>
        <div style={{display:"flex",gap:"1rem",flexWrap:"wrap",marginBottom:"0.75rem"}}>
          {isFlexivel ? (
             <>
               <span className="fp-badge fp-badge-green">R$ {fmt(totalPagoVal)} pago</span>
               <span className="fp-badge fp-badge-orange">Saldo: R$ {fmt(financed - totalPagoVal)}</span>
             </>
          ) : (
             <>
               <span className="fp-badge fp-badge-green">{pagas} pagas</span>
               {atrasadas > 0 && <span className="fp-badge fp-badge-red">{atrasadas} atrasadas</span>}
               <span className="fp-badge fp-badge-orange">{pendentes} pendentes</span>
             </>
          )}
          <span className="fp-badge">{pct}% concluído</span>
        </div>
        <div className="fp-progress-wrap" style={{width:"100%",height:10}}><div className="fp-progress-bar" style={{width:\`\${pct}%\`}} /></div>
      </div>
      
      {isFlexivel && (
        <div style={{ background: "var(--bg-surface)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--border-color)", marginBottom: "1rem" }}>
          <div style={{ fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.9rem" }}>Registrar Pagamento</div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
            <label style={{flex: 1, fontSize: "0.8rem", color: "var(--text-secondary)"}}>
              Data
              <input className="fp-input" type="date" value={novoPgto.data} onChange={e => setNovoPgto(p => ({...p, data: e.target.value}))} />
            </label>
            <label style={{flex: 1, fontSize: "0.8rem", color: "var(--text-secondary)"}}>
              Valor (R$)
              <input className="fp-input" type="number" value={novoPgto.valor} onChange={e => setNovoPgto(p => ({...p, valor: e.target.value}))} placeholder="0,00" />
            </label>
            <button className="fp-btn-green" style={{height: "35px", padding: "0 1rem", marginBottom: "4px"}} onClick={handleAddPgto}>
              <PlusCircle size={16} /> Adicionar
            </button>
          </div>
        </div>
      )}

      {!isFlexivel && (
        <div className="fp-toolbar" style={{marginBottom:"0.75rem"}}>
          {["todas","pagas","atrasadas","pendentes"].map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={filtro === f ? "fp-btn-primary" : "fp-btn-secondary"}
              style={{padding:"4px 12px",fontSize:"0.8rem"}}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      )}
      
      {loading ? <p className="fp-loading">Carregando...</p> : (
        <div style={{maxHeight:"45vh",overflowY:"auto"}}>
          <table className="fp-table">
            <thead>
              <tr>
                {isFlexivel ? null : <th>#</th>}
                <th>{isFlexivel ? "Data do Pagamento" : "Vencimento"}</th>
                {!isFlexivel && <th>Pagamento</th>}
                <th style={{textAlign:"right"}}>Valor</th>
                {!isFlexivel && <th style={{textAlign:"center"}}>Status</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map(p => (
                <tr key={p.id} className={calcSt(p) === "atrasado" ? "fp-row-alert" : p.status === "pago" ? "fp-row-done" : ""}>
                  {isFlexivel ? null : <td style={{fontWeight:600}}>{p.numero_parcela}/{parcelas.length}</td>}
                  <td>{isFlexivel ? fmtDate(p.data_pagamento) : fmtDate(p.data_vencimento)}</td>
                  {!isFlexivel && <td>{fmtDate(p.data_pagamento)}</td>}
                  <td style={{textAlign:"right",fontWeight:600}}>R$ {fmt(p.valor_parcela)}</td>
                  {!isFlexivel && <td style={{textAlign:"center"}}>{statusBadge(p)}</td>}
                  <td style={{textAlign:"right"}}>
                    {calcSt(p) !== "pago" && !isFlexivel && (
                      <button className="fp-btn-sm fp-btn-green" onClick={() => handlePagar(p)}><CheckCircle size={12} /> Pagar</button>
                    )}
                    {calcSt(p) === "pago" && (
                      <button className="fp-btn-sm fp-btn-secondary" style={{fontSize:"0.72rem"}} onClick={() => handleEstornar(p)}>Estornar</button>
                    )}
                  </td>
                </tr>
              ))}
              {listaFiltrada.length === 0 && (
                <tr><td colSpan={6} style={{textAlign:"center", color:"#888"}}>Nenhum registro encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </ModalBase>
  );
}

function Emprestimos({ tipo = "bancario" }) {
  const [emprestimos, setEmprestimos] = useState([]);
  const [parcelas, setParcelas] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalParcelas, setModalParcelas] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isFlex, setIsFlex] = useState(tipo === "pessoal"); // Por padrao, pessoais podem ser flex
  const [form, setForm] = useState({ credor:"", contrato_numero:"", titular:"", valor_total_financiado:"", valor_liberado:"", valor_total_a_pagar:"", taxa_juros_mensal:"", quantidade_parcelas:"", data_contratacao: today(), dia_vencimento:"", valor_parcela_fixa:"" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: emp } = await supabase.from("emprestimos").select("*").eq("categoria", tipo).order("data_contratacao");
    const { data: parc } = await supabase.from("emprestimo_parcelas").select("emprestimo_id, status, valor_parcela, data_vencimento");

    // Agrupar resumo por emprestimo
    const resumo = {};
    (emp || []).forEach(e => {
      resumo[e.id] = { pagas:0, total:0, atrasadas:0, pendentes:0, proximaVenc:null, valorParcela:0, valorPagoTotal:0 };
    });
    
    (parc || []).forEach(p => {
      if (!resumo[p.emprestimo_id]) return;
      resumo[p.emprestimo_id].total++;
      if (!resumo[p.emprestimo_id].valorParcela) resumo[p.emprestimo_id].valorParcela = parseFloat(p.valor_parcela) || 0;
      
      if (p.status === "pago") {
        resumo[p.emprestimo_id].pagas++;
        resumo[p.emprestimo_id].valorPagoTotal += (parseFloat(p.valor_parcela) || 0);
      }
      else if (p.status !== "pago" && p.data_vencimento < new Date().toISOString().split("T")[0]) resumo[p.emprestimo_id].atrasadas++;
      else {
        resumo[p.emprestimo_id].pendentes++;
        if (!resumo[p.emprestimo_id].proximaVenc || p.data_vencimento < resumo[p.emprestimo_id].proximaVenc) {
          resumo[p.emprestimo_id].proximaVenc = p.data_vencimento;
        }
      }
    });
    setParcelas(resumo);
    setEmprestimos(emp || []);
    setLoading(false);
  }, [tipo]);

  useEffect(() => { load(); }, [load]);

  const handleSaveEmp = async () => {
    let req = [];
    if (isFlex) {
       req = ["credor","valor_total_financiado","data_contratacao"];
    } else {
       req = ["credor","valor_total_financiado","quantidade_parcelas","data_contratacao","dia_vencimento","valor_parcela_fixa"];
    }
    
    if (req.some(k => !form[k])) return alert("Preencha os campos obrigatorios (*).");
    
    const valFin = parseN(form.valor_total_financiado);
    
    const { data: empNew, error } = await supabase.from("emprestimos").insert([{
      credor: form.credor, contrato_numero: form.contrato_numero, titular: form.titular,
      valor_total_financiado: valFin,
      valor_liberado: parseN(form.valor_liberado) || null,
      valor_total_a_pagar: isFlex ? valFin : (parseN(form.valor_total_a_pagar) || null),
      taxa_juros_mensal: parseN(form.taxa_juros_mensal) || null,
      quantidade_parcelas: isFlex ? 0 : parseInt(form.quantidade_parcelas),
      data_contratacao: form.data_contratacao,
      status: "ativo", categoria: tipo
    }]).select().single();
    if (error || !empNew) return alert("Erro ao salvar: " + (error?.message || ""));

    if (!isFlex) {
      const dia = parseInt(form.dia_vencimento);
      const qtd = parseInt(form.quantidade_parcelas);
      const baseDate = new Date(form.data_contratacao);
      const parcArr = [];
      for (let i = 0; i < qtd; i++) {
        const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, dia);
        parcArr.push({ emprestimo_id: empNew.id, numero_parcela: i+1, valor_parcela: parseN(form.valor_parcela_fixa), data_vencimento: d.toISOString().split("T")[0], status: "pendente" });
      }
      await supabase.from("emprestimo_parcelas").insert(parcArr);
    }
    
    setShowForm(false);
    setForm({ credor:"", contrato_numero:"", titular:"", valor_total_financiado:"", valor_liberado:"", valor_total_a_pagar:"", taxa_juros_mensal:"", quantidade_parcelas:"", data_contratacao: today(), dia_vencimento:"", valor_parcela_fixa:"" });
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Excluir este contrato e todos os pagamentos?")) return;
    await supabase.from("emprestimo_parcelas").delete().eq("emprestimo_id", id);
    await supabase.from("emprestimos").delete().eq("id", id);
    load();
  };

  const ativos = emprestimos.filter(e => e.status === "ativo").length;
  const totalFinanciado = emprestimos.reduce((s, e) => s + parseN(e.valor_total_financiado), 0);
  
  const totalMensal = emprestimos.filter(e => e.status === "ativo").reduce((s, e) => {
    if (e.quantidade_parcelas === 0) return s; // Flexivel nao soma no compromisso mensal fixo
    const r = parcelas[e.id];
    return s + parseN(r ? r.valorParcela : 0);
  }, 0);
  
  const totalAberto = emprestimos.reduce((s, e) => {
    const r = parcelas[e.id] || { valorPagoTotal: 0, total: 0, pagas: 0, valorParcela: 0 };
    if (e.quantidade_parcelas === 0) {
       return s + (parseN(e.valor_total_financiado) - r.valorPagoTotal);
    } else {
       const restantes = r.total - r.pagas;
       return s + (parseN(r.valorParcela) * restantes);
    }
  }, 0);

  const diasAteVencer = (d) => {
    if (!d) return null;
    return Math.ceil((new Date(d + "T12:00:00") - new Date()) / (1000*60*60*24));
  };

  return (
    <div className="fp-tab-content">
      {modalParcelas && <ParcelasModal emprestimo={modalParcelas} onClose={() => setModalParcelas(null)} onUpdate={load} />}
      
      <div className="fp-summary-cards">
        <div className="fp-card fp-card-orange">
          <CreditCard size={28} />
          <div>
            <div className="fp-card-label">Compromisso Fixo Mensal</div>
            <div className="fp-card-value">R$ {fmt(totalMensal)}</div>
          </div>
        </div>
        <div className="fp-card fp-card-mini"><div className="fp-card-label">Contratos Ativos</div><div className="fp-card-value-sm">{ativos}</div></div>
        <div className="fp-card fp-card-mini"><div className="fp-card-label">Total Emprestado</div><div className="fp-card-value-sm">R$ {fmt(totalFinanciado)}</div></div>
        <div className="fp-card fp-card-mini"><div className="fp-card-label">Saldo Total em Aberto</div><div className="fp-card-value-sm" style={{color:"#EF4444"}}>R$ {fmt(totalAberto)}</div></div>
      </div>

      <div className="fp-toolbar">
        <button className="fp-btn-orange" onClick={() => setShowForm(true)}><PlusCircle size={16} /> Novo Registro</button>
      </div>

      {loading ? <p className="fp-loading">Carregando...</p> : (
        <div className="fp-emprestimos-grid">
          {emprestimos.map(emp => {
            const r = parcelas[emp.id] || { pagas:0, total:0, atrasadas:0, pendentes:0, proximaVenc:null, valorPagoTotal: 0 };
            const isFlex = emp.quantidade_parcelas === 0;
            const financiado = parseN(emp.valor_total_financiado);
            let pct = 0;
            let subtext = "";
            let saldoAtual = 0;
            
            if (isFlex) {
              pct = financiado > 0 ? Math.min(Math.round((r.valorPagoTotal / financiado) * 100), 100) : 0;
              subtext = \`R$ \${fmt(r.valorPagoTotal)} pago\`;
              saldoAtual = financiado - r.valorPagoTotal;
            } else {
              pct = r.total > 0 ? Math.round((r.pagas / r.total) * 100) : 0;
              subtext = \`\${r.pagas} / \${r.total} parcelas\`;
              saldoAtual = (r.total - r.pagas) * parseN(r.valorParcela);
            }
            
            const diasV = diasAteVencer(r.proximaVenc);
            
            return (
              <div key={emp.id} className="fp-emp-card">
                <div className="fp-emp-header">
                  <div>
                    <div className="fp-emp-credor">{emp.credor}</div>
                    <div className="fp-emp-titular">{emp.titular}</div>
                    {emp.contrato_numero && <div className="fp-emp-contrato">Contrato: {emp.contrato_numero}</div>}
                    {isFlex && <div className="fp-emp-contrato" style={{color: "#F97316", fontWeight: 600}}>Dívida Flexível (Livre)</div>}
                  </div>
                  <div className="fp-emp-actions">
                    <button className="fp-btn-sm fp-btn-primary" onClick={() => setModalParcelas(emp)}><ChevronRight size={14} /> {isFlex ? "Pagamentos" : "Ver Detalhes"}</button>
                    <button className="fp-icon-btn fp-icon-btn-danger" onClick={() => handleDelete(emp.id)}><Trash2 size={16} /></button>
                  </div>
                </div>
                
                <div className="fp-emp-stats">
                  <div><div className="fp-emp-stat-label">{isFlex ? "VALOR BASE" : "PARCELA"}</div><div className="fp-emp-stat-val" style={{color:"#EF4444"}}>{isFlex ? \`R$ \${fmt(financiado)}\` : \`R$ \${fmt(r.valorParcela)}/mês\`}</div></div>
                  <div><div className="fp-emp-stat-label">SALDO ABERTO</div><div className="fp-emp-stat-val">R$ {fmt(saldoAtual)}</div></div>
                  <div>
                    <div className="fp-emp-stat-label">PROGRESSO</div>
                    <div className="fp-emp-stat-val">{subtext}</div>
                  </div>
                  {!isFlex && (
                    <div style={{textAlign:"right"}}>
                      {r.atrasadas > 0 && <div className="fp-badge fp-badge-red" style={{marginBottom:"4px"}}>{r.atrasadas} atrasadas</div>}
                      {r.proximaVenc && <div className="fp-badge fp-badge-orange"><Calendar size={10} style={{marginRight:4}}/> Prox: {fmtDate(r.proximaVenc)} ({diasV}d)</div>}
                    </div>
                  )}
                </div>
                
                <div className="fp-emp-progress">
                  <div className="fp-progress-wrap"><div className="fp-progress-bar" style={{width:\`\${pct}%\`}} /></div>
                  <div className="fp-progress-text">
                    <span>{pct}% pago</span>
                    {emp.taxa_juros_mensal ? <span>{emp.taxa_juros_mensal}% a.m.</span> : null}
                    {!isFlex && <span>Total financiado: R$ {fmt(financiado)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {emprestimos.length === 0 && <p style={{color:"#888", padding:"2rem"}}>Nenhum registro encontrado nesta categoria.</p>}
        </div>
      )}

      {showForm && (
        <ModalBase title="Novo Registro de Dívida/Empréstimo" onClose={() => setShowForm(false)} wide>
          <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "8px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600 }}>
              <input type="checkbox" checked={isFlex} onChange={e => setIsFlex(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "#F97316" }} />
              Dívida Flexível (Pagamento livre, sem parcelas fixas)
            </label>
            {isFlex && <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "4px 0 0 24px" }}>Ideal para dinheiro pego com parentes ou com a empresa, onde você paga quando pode.</p>}
          </div>
          
          <div className="fp-form-grid">
            <label>Credor / Origem *<input className="fp-input" value={form.credor} onChange={e => setForm(p => ({...p, credor: e.target.value}))} placeholder="Ex: Minha Empresa" /></label>
            <label>Valor Pegado (Financiado) *<input className="fp-input" type="number" value={form.valor_total_financiado} onChange={e => setForm(p => ({...p, valor_total_financiado: e.target.value}))} /></label>
            <label>Data *<input className="fp-input" type="date" value={form.data_contratacao} onChange={e => setForm(p => ({...p, data_contratacao: e.target.value}))} /></label>
            
            {!isFlex && (
              <>
                <label>Titular<input className="fp-input" value={form.titular} onChange={e => setForm(p => ({...p, titular: e.target.value}))} placeholder="Ex: Cintia Regina" /></label>
                <label>Numero do Contrato<input className="fp-input" value={form.contrato_numero} onChange={e => setForm(p => ({...p, contrato_numero: e.target.value}))} /></label>
                <label>Valor Liberado<input className="fp-input" type="number" value={form.valor_liberado} onChange={e => setForm(p => ({...p, valor_liberado: e.target.value}))} /></label>
                <label>Total a Pagar<input className="fp-input" type="number" value={form.valor_total_a_pagar} onChange={e => setForm(p => ({...p, valor_total_a_pagar: e.target.value}))} /></label>
                <label>Juros (% a.m.)<input className="fp-input" type="number" value={form.taxa_juros_mensal} onChange={e => setForm(p => ({...p, taxa_juros_mensal: e.target.value}))} /></label>
                <label>Qtd de Parcelas *<input className="fp-input" type="number" value={form.quantidade_parcelas} onChange={e => setForm(p => ({...p, quantidade_parcelas: e.target.value}))} placeholder="Ex: 24" /></label>
                <label>Valor da Parcela Fixa *<input className="fp-input" type="number" value={form.valor_parcela_fixa} onChange={e => setForm(p => ({...p, valor_parcela_fixa: e.target.value}))} /></label>
                <label>Dia de Vencimento Mensal *<input className="fp-input" type="number" min="1" max="31" value={form.dia_vencimento} onChange={e => setForm(p => ({...p, dia_vencimento: e.target.value}))} placeholder="Ex: 15" /></label>
              </>
            )}
          </div>
          <div className="fp-modal-footer">
            <button className="fp-btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="fp-btn-orange" onClick={handleSaveEmp}>Salvar Registro</button>
          </div>
        </ModalBase>
      )}
    </div>
  );
}
function Resumo() {`;

content = content.replace(regex, newCode);
fs.writeFileSync(path, content, 'utf8');
