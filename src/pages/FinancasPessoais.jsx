import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { PlusCircle, TrendingUp, TrendingDown, CreditCard, X, Trash2, AlertCircle, CheckCircle } from "lucide-react";
import "./FinancasPessoais.css";

const CATEGORIAS_SAIDA = ["Mercado","Gasolina","Sem Parar","Escola / Filhos","Saúde","Lazer","Contas Fixas","Vestuário","Restaurante","Outros"];
const CATEGORIAS_ENTRADA = ["Salário","Freelance","Aluguel","Investimento","Outros"];
const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().split("T")[0];
const parseN = (v) => parseFloat(String(v).replace(",", ".")) || 0;

function ModalBase({ title, onClose, children }) {
  return (
    <div className="fp-modal-overlay" onClick={onClose}>
      <div className="fp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fp-modal-header">
          <h3>{title}</h3>
          <button className="fp-close-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="fp-modal-body">{children}</div>
      </div>
    </div>
  );
}

function Entradas() {
  const [entradas, setEntradas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ descricao: "", valor: "", data: today(), categoria: "Salário", observacao: "" });
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
    if (!form.descricao || !form.valor) return alert("Preencha descrição e valor.");
    await supabase.from("pessoal_entradas").insert([{ ...form, valor: parseN(form.valor) }]);
    setShowModal(false);
    setForm({ descricao: "", valor: "", data: today(), categoria: "Salário", observacao: "" });
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
        <input type="month" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} className="fp-input" />
        <button className="fp-btn-primary" onClick={() => setShowModal(true)}><PlusCircle size={16} /> Nova Entrada</button>
      </div>
      {loading ? <p className="fp-loading">Carregando...</p> : (
        <table className="fp-table">
          <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Observação</th><th style={{textAlign:"right"}}>Valor</th><th></th></tr></thead>
          <tbody>
            {listaDoMes.length === 0 && <tr><td colSpan={6} style={{textAlign:"center",color:"#888",padding:"2rem"}}>Nenhuma entrada neste mês.</td></tr>}
            {listaDoMes.map((e) => (
              <tr key={e.id}>
                <td>{e.data}</td><td>{e.descricao}</td>
                <td><span className="fp-badge fp-badge-green">{e.categoria}</span></td>
                <td>{e.observacao || "—"}</td>
                <td style={{textAlign:"right",fontWeight:600,color:"var(--success)"}}>R$ {fmt(e.valor)}</td>
                <td><button className="fp-icon-btn" onClick={() => handleDelete(e.id)}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showModal && (
        <ModalBase title="Nova Entrada" onClose={() => setShowModal(false)}>
          <div className="fp-form-grid">
            <label>Descrição *<input className="fp-input" value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Salário Dezembro" /></label>
            <label>Valor (R$) *<input className="fp-input" type="number" value={form.valor} onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} /></label>
            <label>Data *<input className="fp-input" type="date" value={form.data} onChange={(e) => setForm((p) => ({ ...p, data: e.target.value }))} /></label>
            <label>Categoria<select className="fp-input" value={form.categoria} onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))}>{CATEGORIAS_ENTRADA.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label style={{gridColumn:"1 / -1"}}>Observação<input className="fp-input" value={form.observacao} onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))} placeholder="Opcional" /></label>
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

function Saidas() {
  const [saidas, setSaidas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ descricao: "", valor: "", data: today(), categoria: "Mercado", observacao: "" });
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7));
  const [categoriaFiltro, setCategoriaFiltro] = useState("Todas");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("pessoal_saidas").select("*").order("data", { ascending: false });
    setSaidas(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saidasDoMes = saidas.filter((s) => s.data?.startsWith(mesFiltro));
  const saidasFiltradas = categoriaFiltro === "Todas" ? saidasDoMes : saidasDoMes.filter((s) => s.categoria === categoriaFiltro);
  const totalMes = saidasDoMes.reduce((sum, s) => sum + parseN(s.valor), 0);
  const porCategoria = CATEGORIAS_SAIDA.map((cat) => ({ cat, total: saidasDoMes.filter((s) => s.categoria === cat).reduce((sum, s) => sum + parseN(s.valor), 0) })).filter((c) => c.total > 0);

  const handleSave = async () => {
    if (!form.descricao || !form.valor) return alert("Preencha descrição e valor.");
    await supabase.from("pessoal_saidas").insert([{ ...form, valor: parseN(form.valor) }]);
    setShowModal(false);
    setForm({ descricao: "", valor: "", data: today(), categoria: "Mercado", observacao: "" });
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Excluir esta saída?")) return;
    await supabase.from("pessoal_saidas").delete().eq("id", id);
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
      <div className="fp-toolbar">
        <input type="month" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} className="fp-input" />
        <select className="fp-input" value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}><option>Todas</option>{CATEGORIAS_SAIDA.map((c) => <option key={c}>{c}</option>)}</select>
        <button className="fp-btn-danger" onClick={() => setShowModal(true)}><PlusCircle size={16} /> Nova Saída</button>
      </div>
      {loading ? <p className="fp-loading">Carregando...</p> : (
        <table className="fp-table">
          <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Observação</th><th style={{textAlign:"right"}}>Valor</th><th></th></tr></thead>
          <tbody>
            {saidasFiltradas.length === 0 && <tr><td colSpan={6} style={{textAlign:"center",color:"#888",padding:"2rem"}}>Nenhuma saída neste mês.</td></tr>}
            {saidasFiltradas.map((s) => (
              <tr key={s.id}>
                <td>{s.data}</td><td>{s.descricao}</td>
                <td><span className="fp-badge fp-badge-red">{s.categoria}</span></td>
                <td>{s.observacao || "—"}</td>
                <td style={{textAlign:"right",fontWeight:600,color:"#EF4444"}}>R$ {fmt(s.valor)}</td>
                <td><button className="fp-icon-btn fp-icon-btn-danger" onClick={() => handleDelete(s.id)}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showModal && (
        <ModalBase title="Nova Saída" onClose={() => setShowModal(false)}>
          <div className="fp-form-grid">
            <label>Descrição *<input className="fp-input" value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Mercado Extra" /></label>
            <label>Valor (R$) *<input className="fp-input" type="number" value={form.valor} onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} /></label>
            <label>Data *<input className="fp-input" type="date" value={form.data} onChange={(e) => setForm((p) => ({ ...p, data: e.target.value }))} /></label>
            <label>Categoria *<select className="fp-input" value={form.categoria} onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))}>{CATEGORIAS_SAIDA.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label style={{gridColumn:"1 / -1"}}>Observação<input className="fp-input" value={form.observacao} onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))} placeholder="Opcional" /></label>
          </div>
          <div className="fp-modal-footer">
            <button className="fp-btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
            <button className="fp-btn-danger" onClick={handleSave}>Salvar</button>
          </div>
        </ModalBase>
      )}
    </div>
  );
}

function Emprestimos() {
  const [emprestimos, setEmprestimos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ credor:"",valor_total:"",valor_parcela:"",data_inicio:today(),data_vencimento:"",dia_vencimento:"",parcelas_total:"",parcelas_pagas:0,taxa_juros:0,observacao:"",ativo:true });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("pessoal_emprestimos").select("*").order("data_vencimento");
    setEmprestimos(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    const req = ["credor","valor_total","valor_parcela","data_inicio","data_vencimento","dia_vencimento","parcelas_total"];
    if (req.some((k) => !form[k])) return alert("Preencha todos os campos obrigatórios (*).");
    await supabase.from("pessoal_emprestimos").insert([{ ...form, valor_total:parseN(form.valor_total), valor_parcela:parseN(form.valor_parcela), dia_vencimento:parseInt(form.dia_vencimento), parcelas_total:parseInt(form.parcelas_total), parcelas_pagas:parseInt(form.parcelas_pagas)||0, taxa_juros:parseN(form.taxa_juros) }]);
    setShowModal(false);
    setForm({ credor:"",valor_total:"",valor_parcela:"",data_inicio:today(),data_vencimento:"",dia_vencimento:"",parcelas_total:"",parcelas_pagas:0,taxa_juros:0,observacao:"",ativo:true });
    load();
  };

  const handlePagamento = async (emp) => {
    const novas = (emp.parcelas_pagas || 0) + 1;
    if (novas > emp.parcelas_total) return alert("Todas as parcelas já foram pagas!");
    if (!window.confirm(`Registrar pagamento ${novas}/${emp.parcelas_total} de ${emp.credor}?`)) return;
    await supabase.from("pessoal_emprestimos").update({ parcelas_pagas: novas }).eq("id", emp.id);
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Excluir este empréstimo?")) return;
    await supabase.from("pessoal_emprestimos").delete().eq("id", id);
    load();
  };

  const proximoVencimento = (emp) => {
    const hoje = new Date();
    const t = new Date(hoje.getFullYear(), hoje.getMonth(), emp.dia_vencimento);
    if (t < hoje) t.setMonth(t.getMonth() + 1);
    return t;
  };
  const diasParaVencer = (emp) => Math.ceil((proximoVencimento(emp) - new Date()) / (1000*60*60*24));

  const totalMensal = emprestimos.filter((e) => e.ativo).reduce((s, e) => s + parseN(e.valor_parcela), 0);
  const totalRestante = emprestimos.filter((e) => e.ativo).reduce((s, e) => s + parseN(e.valor_parcela) * (e.parcelas_total - (e.parcelas_pagas || 0)), 0);

  return (
    <div className="fp-tab-content">
      <div className="fp-summary-cards">
        <div className="fp-card fp-card-orange"><CreditCard size={28} /><div><div className="fp-card-label">Compromisso Mensal</div><div className="fp-card-value">R$ {fmt(totalMensal)}</div></div></div>
        <div className="fp-card fp-card-mini"><div className="fp-card-label">Total em Aberto</div><div className="fp-card-value-sm">R$ {fmt(totalRestante)}</div></div>
        <div className="fp-card fp-card-mini"><div className="fp-card-label">Contratos Ativos</div><div className="fp-card-value-sm">{emprestimos.filter((e) => e.ativo).length}</div></div>
      </div>
      <div className="fp-toolbar">
        <button className="fp-btn-orange" onClick={() => setShowModal(true)}><PlusCircle size={16} /> Novo Empréstimo</button>
      </div>
      {loading ? <p className="fp-loading">Carregando...</p> : (
        <table className="fp-table">
          <thead><tr><th>Credor</th><th style={{textAlign:"right"}}>Valor Total</th><th style={{textAlign:"right"}}>Parcela</th><th style={{textAlign:"center"}}>Progresso</th><th style={{textAlign:"center"}}>Próx. Vencimento</th><th style={{textAlign:"center"}}>Taxa %</th><th>Obs.</th><th></th></tr></thead>
          <tbody>
            {emprestimos.length === 0 && <tr><td colSpan={8} style={{textAlign:"center",color:"#888",padding:"2rem"}}>Nenhum empréstimo cadastrado.</td></tr>}
            {emprestimos.map((emp) => {
              const pagas = emp.parcelas_pagas || 0;
              const total = emp.parcelas_total || 1;
              const pct = Math.round((pagas / total) * 100);
              const quitado = pagas >= total;
              const dias = (!quitado && emp.ativo) ? diasParaVencer(emp) : null;
              const vencPerto = dias !== null && dias <= 5;
              return (
                <tr key={emp.id} className={quitado ? "fp-row-done" : vencPerto ? "fp-row-alert" : ""}>
                  <td style={{fontWeight:600}}>{emp.credor}</td>
                  <td style={{textAlign:"right"}}>R$ {fmt(emp.valor_total)}</td>
                  <td style={{textAlign:"right",color:"#EF4444",fontWeight:600}}>R$ {fmt(emp.valor_parcela)}</td>
                  <td style={{textAlign:"center"}}>
                    <div className="fp-progress-wrap"><div className="fp-progress-bar" style={{width:`${pct}%`}} /></div>
                    <div className="fp-progress-label">{pagas}/{total} ({pct}%)</div>
                  </td>
                  <td style={{textAlign:"center"}}>
                    {quitado
                      ? <span className="fp-badge fp-badge-green">Quitado ✓</span>
                      : <span className={`fp-badge ${vencPerto ? "fp-badge-red" : "fp-badge-orange"}`}>{vencPerto && <AlertCircle size={12} style={{marginRight:4}} />}Dia {emp.dia_vencimento} ({dias}d)</span>}
                  </td>
                  <td style={{textAlign:"center"}}>{emp.taxa_juros ? `${emp.taxa_juros}%` : "—"}</td>
                  <td>{emp.observacao || "—"}</td>
                  <td style={{display:"flex",gap:6}}>
                    {!quitado && <button className="fp-btn-sm fp-btn-green" onClick={() => handlePagamento(emp)}><CheckCircle size={13} /> Pagar</button>}
                    <button className="fp-icon-btn fp-icon-btn-danger" onClick={() => handleDelete(emp.id)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {showModal && (
        <ModalBase title="Novo Empréstimo / Financiamento" onClose={() => setShowModal(false)}>
          <div className="fp-form-grid">
            <label>Credor / Banco *<input className="fp-input" value={form.credor} onChange={(e) => setForm((p) => ({ ...p, credor: e.target.value }))} placeholder="Ex: Banco Itaú" /></label>
            <label>Valor Total *<input className="fp-input" type="number" value={form.valor_total} onChange={(e) => setForm((p) => ({ ...p, valor_total: e.target.value }))} /></label>
            <label>Valor da Parcela *<input className="fp-input" type="number" value={form.valor_parcela} onChange={(e) => setForm((p) => ({ ...p, valor_parcela: e.target.value }))} /></label>
            <label>Nº Total de Parcelas *<input className="fp-input" type="number" value={form.parcelas_total} onChange={(e) => setForm((p) => ({ ...p, parcelas_total: e.target.value }))} /></label>
            <label>Parcelas Já Pagas<input className="fp-input" type="number" value={form.parcelas_pagas} onChange={(e) => setForm((p) => ({ ...p, parcelas_pagas: e.target.value }))} /></label>
            <label>Dia Vencimento Mensal *<input className="fp-input" type="number" min="1" max="31" value={form.dia_vencimento} onChange={(e) => setForm((p) => ({ ...p, dia_vencimento: e.target.value }))} placeholder="Ex: 15" /></label>
            <label>Data Início *<input className="fp-input" type="date" value={form.data_inicio} onChange={(e) => setForm((p) => ({ ...p, data_inicio: e.target.value }))} /></label>
            <label>Data Vencimento Final *<input className="fp-input" type="date" value={form.data_vencimento} onChange={(e) => setForm((p) => ({ ...p, data_vencimento: e.target.value }))} /></label>
            <label>Taxa Juros (% a.m.)<input className="fp-input" type="number" value={form.taxa_juros} onChange={(e) => setForm((p) => ({ ...p, taxa_juros: e.target.value }))} placeholder="0" /></label>
            <label style={{gridColumn:"1 / -1"}}>Observação<input className="fp-input" value={form.observacao} onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))} placeholder="Opcional" /></label>
          </div>
          <div className="fp-modal-footer">
            <button className="fp-btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
            <button className="fp-btn-orange" onClick={handleSave}>Salvar</button>
          </div>
        </ModalBase>
      )}
    </div>
  );
}

export default function FinancasPessoais() {
  const [aba, setAba] = useState("entradas");
  return (
    <div className="fp-container">
      <div className="fp-header">
        <h1>💰 Finanças Pessoais</h1>
        <p className="fp-subtitle">Controle privado de Daniel &amp; Cintia — separado da empresa</p>
      </div>
      <div className="fp-tabs">
        <button className={`fp-tab ${aba === "entradas" ? "fp-tab-active fp-tab-green" : ""}`} onClick={() => setAba("entradas")}><TrendingUp size={16} /> Entradas</button>
        <button className={`fp-tab ${aba === "saidas" ? "fp-tab-active fp-tab-red" : ""}`} onClick={() => setAba("saidas")}><TrendingDown size={16} /> Saídas</button>
        <button className={`fp-tab ${aba === "emprestimos" ? "fp-tab-active fp-tab-orange" : ""}`} onClick={() => setAba("emprestimos")}><CreditCard size={16} /> Empréstimos</button>
      </div>
      {aba === "entradas" && <Entradas />}
      {aba === "saidas" && <Saidas />}
      {aba === "emprestimos" && <Emprestimos />}
    </div>
  );
}
