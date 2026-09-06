import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { PlusCircle, TrendingUp, TrendingDown, CreditCard, X, Trash2, AlertCircle, CheckCircle, ChevronDown, ChevronRight, Calendar } from "lucide-react";
import "./FinancasPessoais.css";

const CATEGORIAS_SAIDA = ["Gastos fixos", "Escola", "Carros", "Mercado", "Vestuario", "Lazer"];
const CATEGORIAS_ENTRADA = ["Salario","Freelance","Aluguel","Investimento","Outros"];
const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().split("T")[0];
const parseN = (v) => parseFloat(String(v).replace(",", ".")) || 0;
const fmtDate = (d) => { if (!d) return "—"; const [y,m,day] = d.split("-"); return `${day}/${m}/${y}`; };

function ModalBase({ title, onClose, children, wide }) {
  return (
    <div className="fp-modal-overlay" onClick={onClose}>
      <div className={"fp-modal" + (wide ? " fp-modal-wide" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="fp-modal-header">
          <h3>{title}</h3>
          <button className="fp-close-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="fp-modal-body">{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ABA ENTRADAS
// ─────────────────────────────────────────────
function Entradas() {
  const [entradas, setEntradas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ descricao: "", valor: "", data: today(), categoria: "Salario", observacao: "" });
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("pessoal_entradas").select("*").order("data", { ascending: false });
    setEntradas(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const listaDoMes = entradas.filter((e) => e.data?.startsWith(mesFiltro));
  const totalMes = listaDoMes.reduce((s, e) => s + parseN(e.valor), 0);

  const handleSave = async () => {
    if (!form.descricao) return alert("A descrição é obrigatória.");
    if (!form.data) return alert("A data é obrigatória.");
    await supabase.from("pessoal_entradas").insert([{ ...form, valor: parseN(form.valor) }]);
    setForm({ descricao: "", valor: "", data: today(), categoria: "Salario", observacao: "" });
    setShowModal(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Excluir esta entrada?")) return;
    await supabase.from("pessoal_entradas").delete().eq("id", id);
    load();
  };

  return (
    <div className="fp-tab-content">
      <div className="fp-summary-cards">
        <div className="fp-card fp-card-green">
          <TrendingUp size={28} />
          <div>
            <div className="fp-card-label">Total Entradas — {mesFiltro}</div>
            <div className="fp-card-value">R$ {fmt(totalMes)}</div>
          </div>
        </div>
      </div>
      <div className="fp-toolbar">
        <input type="month" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} className="fp-input" style={{width:"auto"}} />
        <button className="fp-btn-primary" onClick={() => setShowModal(true)}><PlusCircle size={16} /> Nova Entrada</button>
      </div>
      {loading ? <p className="fp-loading">Carregando...</p> : (
        <table className="fp-table">
          <thead><tr><th>Vencimento</th><th>Descricao</th><th>Categoria</th><th>Observacao</th><th style={{textAlign:"right"}}>Valor</th><th></th></tr></thead>
          <tbody>
            {listaDoMes.length === 0 && <tr><td colSpan={6} style={{textAlign:"center",color:"#888",padding:"2rem"}}>Nenhuma entrada neste mes.</td></tr>}
            {listaDoMes.map((e) => (
              <tr key={e.id}>
                <td>{fmtDate(e.data)}</td><td>{e.descricao}</td>
                <td><span className="fp-badge fp-badge-green">{e.categoria}</span></td>
                <td>{e.observacao || "—"}</td>
                <td style={{textAlign:"right",fontWeight:600,color:"#22C55E"}}>R$ {fmt(e.valor)}</td>
                <td><button className="fp-icon-btn fp-icon-btn-danger" onClick={() => handleDelete(e.id)}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showModal && (
        <ModalBase title="Nova Entrada" onClose={() => setShowModal(false)}>
          <div className="fp-form-grid">
            <label>Descricao *<input className="fp-input" value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Salario Dezembro" /></label>
            <label>Valor (R$) *<input className="fp-input" type="number" value={form.valor} onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} /></label>
            <label> Vencimento * <input className="fp-input" type="date" value={form.data} onChange={(e) => setForm((p) => ({ ...p, data: e.target.value }))} /></label>
            <label>Categoria<select className="fp-input" value={form.categoria} onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))}>{CATEGORIAS_ENTRADA.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label style={{gridColumn:"1 / -1"}}>Observacao<input className="fp-input" value={form.observacao} onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))} placeholder="Opcional" /></label>
          </div>
          <div className="fp-modal-footer">
            <button className="fp-btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
            <button className="fp-btn-primary" onClick={handleSave}>Salvar</button>
          </div>
        </ModalBase>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// ABA SAIDAS
// ─────────────────────────────────────────────
function Saidas() {
  const [saidas, setSaidas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ descricao: "", valor: "", data: today(), categoria: "Gastos fixos" });
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
    try {
      if (!form.descricao) return alert("A descrição é obrigatória.");
      if (!form.data) return alert("A data de vencimento é obrigatória.");
      
      const val = parseN(form.valor);
      
      const generateUUID = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };
      
      const grupo_id = recorrente ? generateUUID() : null;
      let error = null;
      
      if (recorrente && qtdMeses > 1) {
        const baseDate = new Date(form.data + "T12:00:00");
        const arr = [];
        for(let i=0; i < qtdMeses; i++) {
          const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
          arr.push({ 
            descricao: form.descricao,
            categoria: form.categoria,
            observacao: form.observacao || "",
            valor: val > 0 ? val : null, 
            data: d.toISOString().split("T")[0],
            grupo_id,
            pago: i === 0 ? jaPago : false
          });
        }
        const res = await supabase.from("pessoal_saidas").insert(arr);
        error = res.error;
      } else {
        const res = await supabase.from("pessoal_saidas").insert([{ 
            descricao: form.descricao,
            categoria: form.categoria,
            observacao: form.observacao || "",
            valor: val > 0 ? val : null, 
            data: form.data,
            pago: jaPago, 
            grupo_id 
        }]);
        error = res.error;
      }
      
      if (error) {
        console.error(error);
        alert("Erro do banco: " + error.message);
        return;
      }
      
      setForm({ descricao: "", valor: "", data: today(), categoria: "Gastos fixos", observacao: "" });
      setRecorrente(false);
      setQtdMeses(12);
      setJaPago(false);
      load();
    } catch (err) {
      console.error(err);
      alert("Erro na tela: " + err.message);
    }
  };

  const handleDelete = async (s) => {
    if (s.grupo_id) {
      const delAll = window.confirm("Este é um lançamento recorrente.\nDeseja excluir também todos os meses seguintes?\n\n[OK] = Excluir este e todos os futuros\n[Cancelar] = Excluir APENAS este mês");
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
          <label style={{width: "130px", fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500}}> Vencimento * <input className="fp-input" type="date" value={form.data} onChange={e => setForm(p => ({...p, data: e.target.value}))} />
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
                      `R$ ${fmt(s.valor)}`
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
// ─────────────────────────────────────────────
// ABA EMPRESTIMOS
// ─────────────────────────────────────────────
function ParcelasModal({ emprestimo, onClose, onUpdate }) {
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
    if (!window.confirm(`Marcar parcela ${parcela.numero_parcela} como PAGA?`)) return;
    await supabase.from("emprestimo_parcelas")
      .update({ status: "pago", data_pagamento: today() })
      .eq("id", parcela.id);
    load();
    onUpdate();
  };

  const handleEstornar = async (parcela) => {
    if (!window.confirm(`Estornar pagamento?`)) return;
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
    <ModalBase title={isFlexivel ? `Pagamentos — ${emprestimo.credor}` : `Parcelas — ${emprestimo.credor}`} onClose={onClose} wide>
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
        <div className="fp-progress-wrap" style={{width:"100%",height:10}}><div className="fp-progress-bar" style={{width:`${pct}%`}} /></div>
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
      const baseDate = new Date(form.data_contratacao + "T12:00:00");
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
              subtext = `R$ ${fmt(r.valorPagoTotal)} pago`;
              saldoAtual = financiado - r.valorPagoTotal;
            } else {
              pct = r.total > 0 ? Math.round((r.pagas / r.total) * 100) : 0;
              subtext = `${r.pagas} / ${r.total} parcelas`;
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
                  <div><div className="fp-emp-stat-label">{isFlex ? "VALOR BASE" : "PARCELA"}</div><div className="fp-emp-stat-val" style={{color:"#EF4444"}}>{isFlex ? `R$ ${fmt(financiado)}` : `R$ ${fmt(r.valorParcela)}/mês`}</div></div>
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
                  <div className="fp-progress-wrap"><div className="fp-progress-bar" style={{width:`${pct}%`}} /></div>
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
function Resumo() {
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7));
  const [entradas, setEntradas] = useState([]);
  const [saidas, setSaidas] = useState([]);
  const [parcelas, setParcelas] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Buscar entradas do mes
    const { data: dEntradas } = await supabase.from("pessoal_entradas").select("*").like("data", `${mesFiltro}%`);
    // Buscar saidas do mes
    const { data: dSaidas } = await supabase.from("pessoal_saidas").select("*").like("data", `${mesFiltro}%`);
    // Buscar parcelas do mes
    const { data: dParcelas } = await supabase.from("emprestimo_parcelas").select("*, emprestimos(credor)").like("data_vencimento", `${mesFiltro}%`);
    
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
    ...parcelas.map(p => ({ id: "p"+p.id, data: p.data_vencimento, desc: `Parcela ${p.numero_parcela} - ${p.emprestimos?.credor}`, valor: parseN(p.valor_parcela), tipo: "parcela", status: p.status }))
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
        <button className={`fp-tab ${aba === "resumo" ? "fp-tab-active" : ""}`} onClick={() => setAba("resumo")}><Calendar size={16} /> Resumo</button>
        <button className={`fp-tab ${aba === "entradas" ? "fp-tab-active fp-tab-green" : ""}`} onClick={() => setAba("entradas")}><TrendingUp size={16} /> Entradas</button>
        <button className={`fp-tab ${aba === "saidas" ? "fp-tab-active fp-tab-red" : ""}`} onClick={() => setAba("saidas")}><TrendingDown size={16} /> Saídas</button>
        <button className={`fp-tab ${aba === "bancarios" ? "fp-tab-active fp-tab-orange" : ""}`} onClick={() => setAba("bancarios")}><CreditCard size={16} /> Bancários</button>
        <button className={`fp-tab ${aba === "pessoais" ? "fp-tab-active fp-tab-orange" : ""}`} onClick={() => setAba("pessoais")}><CreditCard size={16} /> Pessoais</button>
      </div>
      {aba === "resumo" && <Resumo />}
      {aba === "entradas" && <Entradas />}
      {aba === "saidas" && <Saidas />}
      {aba === "bancarios" && <Emprestimos tipo="bancario" />}
      {aba === "pessoais" && <Emprestimos tipo="pessoal" />}
    </div>
  );
}
