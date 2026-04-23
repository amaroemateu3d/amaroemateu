import { useState, useEffect } from 'react';
import { getResultados, parseNumber, getCustoUnitario, getUnitProductionTime, formatTime } from '../utils/financeCalculators';
import { Settings, Save, X, Printer, CheckCircle2, RefreshCw, Loader } from 'lucide-react';
import { supabase } from '../supabaseClient';
import './Vendas.css';

const CHANNELS = [
  { id: 'ml', label: 'Mercado Livre', icon: '📦' },
  { id: 'amazon', label: 'Amazon', icon: '🅰️' },
  { id: 'shopee', label: 'Shopee', icon: '🛍️' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵' },
  { id: 'site', label: 'Site Próprio', icon: '🌐' },
  { id: 'presencial', label: 'Presencial', icon: '🏪' }
];

export default function Vendas() {
  const [activeChannel, setActiveChannel] = useState('ml');
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [savedFts, setSavedFts] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [vendasMensal, setVendasMensal] = useState({});
  const [channelDefaults, setChannelDefaults] = useState({});
  const [loadingDb, setLoadingDb] = useState(true);

  const [editingOverride, setEditingOverride] = useState(null);
  const [editingGlobal, setEditingGlobal] = useState(false);
  const [globalFormData, setGlobalFormData] = useState({});
  const [showReport, setShowReport] = useState(false);
  const [selectedFts, setSelectedFts] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoadingDb(true);
    
    const [defRes, overRes, salesRes, ftsRes] = await Promise.all([
      supabase.from('ecommerce_channel_defaults').select('*'),
      supabase.from('ecommerce_overrides').select('*'),
      supabase.from('ecommerce_monthly_sales').select('*'),
      supabase.from('fichas_tecnicas').select('*').order('id', { ascending: true })
    ]);

    setSavedFts((ftsRes.data || []).map(r => r.data));

    const newDefaults = {};
    (defRes.data || []).forEach(d => { newDefaults[d.channel_id] = d.settings; });
    setChannelDefaults(newDefaults);

    const newOverrides = {};
    (overRes.data || []).forEach(o => {
      if (!newOverrides[o.channel_id]) newOverrides[o.channel_id] = {};
      newOverrides[o.channel_id][o.ft_id] = o.settings;
    });
    setOverrides(newOverrides);

    const newVendas = {};
    (salesRes.data || []).forEach(s => {
      if (!newVendas[s.month]) newVendas[s.month] = {};
      if (!newVendas[s.month][s.channel_id]) newVendas[s.month][s.channel_id] = {};
      newVendas[s.month][s.channel_id][s.ft_id] = s.quantity;
    });
    setVendasMensal(newVendas);

    setLoadingDb(false);
  };

  const handleQtyChange = async (ftId, stringVal) => {
    const val = parseInt(stringVal, 10) || 0;
    
    const newVendas = { ...vendasMensal };
    if (!newVendas[currentMonth]) newVendas[currentMonth] = {};
    if (!newVendas[currentMonth][activeChannel]) newVendas[currentMonth][activeChannel] = {};
    
    newVendas[currentMonth][activeChannel][ftId] = val;
    setVendasMensal(newVendas);

    if (val > 0) {
      await supabase.from('ecommerce_monthly_sales').upsert({
        month: currentMonth,
        channel_id: activeChannel,
        ft_id: ftId,
        quantity: val
      });
    } else {
      await supabase.from('ecommerce_monthly_sales')
        .delete()
        .eq('month', currentMonth)
        .eq('channel_id', activeChannel)
        .eq('ft_id', ftId);
    }
  };

  const handleSync = (ftId = null) => {
    setIsSyncing(true);
    setTimeout(async () => {
      const { data } = await supabase.from('fichas_tecnicas').select('*').order('id', { ascending: true });
      const freshFts = (data || []).map(r => r.data);
      
      if (ftId) {
        const latestFt = freshFts.find(f => f.indiceFt === ftId);
        if (latestFt) {
          setSavedFts(prev => prev.map(f => f.indiceFt === ftId ? latestFt : f));
        }
      } else if (selectedFts.length > 0) {
        setSavedFts(prev => prev.map(f => {
          if (selectedFts.includes(f.indiceFt)) {
            const latest = freshFts.find(x => x.indiceFt === f.indiceFt);
            return latest || f;
          }
          return f;
        }));
        setSelectedFts([]);
      } else {
        // Sincroniza tudo
        setSavedFts(freshFts);
      }
      
      setIsSyncing(false);
    }, 400);
  };

  const toggleSelect = (ftId) => {
    setSelectedFts(prev => 
      prev.includes(ftId) ? prev.filter(id => id !== ftId) : [...prev, ftId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedFts.length === savedFts.length) {
      setSelectedFts([]);
    } else {
      setSelectedFts(savedFts.map(f => f.indiceFt));
    }
  };

  const getChannelQty = (ftId) => {
    return vendasMensal[currentMonth]?.[activeChannel]?.[ftId] || 0;
  };

  const handlePriceChange = async (ftId, stringVal) => {
    let safeVal = stringVal;
    if (typeof stringVal === 'string') safeVal = stringVal.replace(',', '.');
    
    const nov = { ...overrides };
    if (!nov[activeChannel]) nov[activeChannel] = {};
    const currentOps = nov[activeChannel][ftId] || {};
    
    let finalOps;
    if (safeVal === "") {
       finalOps = { ...currentOps };
       delete finalOps.precoVendaManual;
    } else {
       finalOps = { ...currentOps, precoVendaManual: safeVal };
    }
    
    if (Object.keys(finalOps).length === 0) {
       delete nov[activeChannel][ftId];
       await supabase.from('ecommerce_overrides')
          .delete()
          .eq('channel_id', activeChannel)
          .eq('ft_id', ftId);
    } else {
       nov[activeChannel][ftId] = finalOps;
       await supabase.from('ecommerce_overrides').upsert({
          channel_id: activeChannel,
          ft_id: ftId,
          settings: finalOps
       });
    }
    setOverrides(nov);
  };

  // Helper para fundir config base com config do canal atual
  const getFtWithOverrides = (ftBase) => {
    // FIX: Agora usa o objeto ftBase COMPLETO para garantir que campos extras e novos campos sejam considerados
    const physicalFT = { ...ftBase };

    // 2. Puxa os padrões globais da tela atual
    const defaults = channelDefaults[activeChannel] || {
      custoEmbalagem: 1.5, custoExtra: 0, custoEnvio: 0,
      taxaFixaVenda: 0, impostosNF: 0, taxaMLPerc: 0, markup: 3
    };

    // 3. Puxa edições que o usuário fez clicando na engrenagem pequena da linha no canal em questão
    const channelOps = overrides[activeChannel]?.[ftBase.indiceFt] || {};

    // 4. Junta tudo na ordem perfeita de prioridade:
    // Começa apenas com a base física da peça -> Taca as taxas Globais em cima -> Taca a Exceção por cima.
    return { ...physicalFT, ...defaults, ...channelOps }; 
  };

  const handleOpenOverride = (ft) => {
    const merged = getFtWithOverrides(ft);
    setEditingOverride({ ftBase: ft, customData: merged });
  };

  const handleOverrideChange = (e) => {
    const { name, value } = e.target;
    let safeVal = value;
    if (typeof value === 'string') safeVal = value.replace(',', '.');

    setEditingOverride(prev => {
      const updatedData = { ...prev.customData, [name]: safeVal };
      return { ...prev, customData: updatedData };
    });
  };

  const saveOverrideModal = async () => {
    const { ftBase, customData } = editingOverride;
    
    // Obter apenas as chaves permitidas para override
    const keysToOverride = ['custoEmbalagem', 'custoExtra', 'custoEnvio', 'taxaFixaVenda', 'impostosNF', 'taxaMLPerc', 'markup', 'precoVendaManual'];
    const finalOps = {};
    
    const defaults = channelDefaults[activeChannel] || {
      custoEmbalagem: 1.5, custoExtra: 0, custoEnvio: 0,
      taxaFixaVenda: 0, impostosNF: 0, taxaMLPerc: 0, markup: 3
    };

    keysToOverride.forEach(k => {
      const val = customData[k];
      const isSet = val !== undefined && val !== null;
      const isDifferentFromGlobal = String(val ?? "") !== String(defaults[k] ?? "");
      
      if (isSet && isDifferentFromGlobal) {
        finalOps[k] = val;
      }
    });

    const newOverrides = { ...overrides };
    if (!newOverrides[activeChannel]) newOverrides[activeChannel] = {};
    
    if (Object.keys(finalOps).length === 0) {
       delete newOverrides[activeChannel][ftBase.indiceFt];
       await supabase.from('ecommerce_overrides')
          .delete()
          .eq('channel_id', activeChannel)
          .eq('ft_id', ftBase.indiceFt);
    } else {
       newOverrides[activeChannel][ftBase.indiceFt] = finalOps;
       await supabase.from('ecommerce_overrides').upsert({
          channel_id: activeChannel,
          ft_id: ftBase.indiceFt,
          settings: finalOps
       });
    }
    
    setOverrides(newOverrides);
    setEditingOverride(null);
  };

  const handleResetOverride = async () => {
    const { ftBase } = editingOverride;
    if (window.confirm(`Tem certeza que deseja apagar a customização da ${ftBase.nomePeca} neste canal? Ela voltará a obedecer 100% da Regra Global.`)) {
      const newOverrides = { ...overrides };
      if (newOverrides[activeChannel]) {
        delete newOverrides[activeChannel][ftBase.indiceFt];
      }
      setOverrides(newOverrides);
      setEditingOverride(null);
      await supabase.from('ecommerce_overrides')
          .delete()
          .eq('channel_id', activeChannel)
          .eq('ft_id', ftBase.indiceFt);
    }
  };

  const openGlobalModal = () => {
    const baseline = {
      custoEmbalagem: 1.5, custoExtra: 0, custoEnvio: 0,
      taxaFixaVenda: 0, impostosNF: 0, taxaMLPerc: 0
    };
    const defaults = { ...baseline, ...(channelDefaults[activeChannel] || {}) };
    setGlobalFormData(defaults);
    setEditingGlobal(true);
  };

  const handleGlobalChange = (e) => {
    const { name, value } = e.target;
    let safeVal = value;
    if (typeof value === 'string') safeVal = value.replace(',', '.');
    setGlobalFormData(prev => ({ ...prev, [name]: safeVal }));
  };

  const saveGlobalModal = async () => {
    const newDefaults = { ...channelDefaults, [activeChannel]: globalFormData };
    setChannelDefaults(newDefaults);
    setEditingGlobal(false);

    await supabase.from('ecommerce_channel_defaults').upsert({
      channel_id: activeChannel,
      settings: globalFormData
    });
  };

  // Cálculo do tempo total de produção para o canal ativo no mês
  const totalProductionTime = Object.entries(vendasMensal[currentMonth]?.[activeChannel] || {}).reduce((acc, [ftId, qty]) => {
    if (qty <= 0) return acc;
    const baseFt = savedFts.find(f => f.indiceFt === ftId);
    if (!baseFt) return acc;
    const unitTime = getUnitProductionTime(baseFt);
    return acc + (unitTime * qty);
  }, 0);

  const filteredFts = savedFts.filter(ft => 
    ft.nomePeca.toLowerCase().includes(searchTerm.toLowerCase()) || 
    ft.indiceFt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-wrapper vendas-page">
      <div className="vendas-header">
        <div>
          <h1 className="page-title">Vendas Multi-Canal</h1>
          <p className="page-description">Controle suas vendas e customize configurações (taxas, fretes e envios) por Marketplace.</p>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
          <button 
            className="btn-secondary" 
            onClick={() => handleSync()} 
            disabled={isSyncing}
            style={{background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--accent-primary)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px'}}
          >
            <RefreshCw size={16} className={isSyncing ? 'spin' : ''} />
            {selectedFts.length > 0 ? `Sincronizar (${selectedFts.length})` : 'Sincronizar Catálogo'}
          </button>

          <button className="btn-secondary" onClick={openGlobalModal} style={{background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)'}}>
            ⚙️ Regras Globais ({CHANNELS.find(c => c.id === activeChannel)?.label})
          </button>
          
          <div className="total-production-chip" style={{
            background: 'var(--bg-surface)', 
            border: '1px solid var(--border-color)', 
            padding: '0.4rem 0.8rem', 
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '2px'
          }}>
            <span style={{fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold'}}>Produção Total</span>
            <span style={{fontSize: '1rem', color: 'var(--accent-primary)', fontWeight: 'bold'}}>⏱️ {formatTime(totalProductionTime)}</span>
          </div>

          <div className="month-selector">
            <input 
              type="month" 
              value={currentMonth} 
              onChange={(e) => setCurrentMonth(e.target.value)} 
            />
          </div>
          <button 
            className="btn-primary" 
            onClick={() => setShowReport(true)}
            style={{background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '8px'}}
          >
            <CheckCircle2 size={18} /> Fechar Mês
          </button>
        </div>
      </div>

      <div className="channels-tabs">
        {CHANNELS.map(ch => (
          <button 
            key={ch.id} 
            className={`channel-tab ${activeChannel === ch.id ? 'active' : ''}`}
            onClick={() => setActiveChannel(ch.id)}
          >
            <span className="icon">{ch.icon}</span>
            <span className="label">{ch.label}</span>
          </button>
        ))}
      </div>

      <div className="card vendas-table-card">
        {loadingDb ? (
           <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)'}}>
             <Loader size={40} className="spinner" color="var(--primary)" style={{marginBottom: '1rem'}} />
             <p>Sincronizando vendas e regras na nuvem...</p>
           </div>
        ) : savedFts.length === 0 ? (
           <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)'}}>
             <p>Você não possui Fichas Técnicas cadastradas ainda.</p>
           </div>
        ) : (
          <div className="table-responsive">
            <div style={{padding: '1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end'}}>
               <div className="search-bar" style={{maxWidth: '300px'}}>
                  <span className="search-icon">🔍</span>
                  <input 
                    type="text" 
                    placeholder="Buscar peça ou código..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
               </div>
            </div>
            <table className="fts-table">
              <thead>
                <tr>
                  <th style={{width: '30px', textAlign: 'center'}}>
                    <input 
                      type="checkbox" 
                      onChange={toggleSelectAll} 
                      checked={selectedFts.length === savedFts.length && savedFts.length > 0}
                    />
                  </th>
                  <th style={{width: '50px'}}>ID</th>
                  <th>Produto</th>
                  <th style={{width: '60px'}}>Tempo</th>
                  <th style={{width: '70px'}}>Prod.</th>
                  <th style={{width: '70px'}}>Venda</th>
                  <th style={{width: '85px'}}>Custo Final</th>
                  <th style={{color: 'var(--accent-primary)', width: '100px'}}>Preço</th>
                  <th style={{color: 'var(--success)', width: '70px'}}>% Marg.</th>
                  <th style={{color: 'var(--success)', width: '85px'}}>Lucro</th>
                  <th style={{width: '70px', textAlign: 'center'}}>Qtd.</th>
                  <th style={{width: '80px', textAlign: 'right'}}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredFts].sort((a,b) => a.indiceFt.localeCompare(b.indiceFt)).map(baseFt => {
                  
                  const channelFt = getFtWithOverrides(baseFt);
                  const res = getResultados(channelFt);
                  const qty = getChannelQty(baseFt.indiceFt);
                  const hasCustom = !!(overrides[activeChannel]?.[baseFt.indiceFt] && Object.keys(overrides[activeChannel][baseFt.indiceFt]).length > 0);

                  return (
                    <tr key={baseFt.indiceFt} className={selectedFts.includes(baseFt.indiceFt) ? 'row-selected' : ''}>
                      <td style={{textAlign: 'center'}}>
                        <input 
                          type="checkbox" 
                          checked={selectedFts.includes(baseFt.indiceFt)} 
                          onChange={() => toggleSelect(baseFt.indiceFt)}
                        />
                      </td>
                      <td><span className="badge">{baseFt.indiceFt}</span></td>
                      <td style={{fontWeight: '600'}}>
                        {baseFt.nomePeca}
                        {hasCustom && <span className="override-badge" title="Possui custos editados isoladamente para este canal.">⚙️ Customizado</span>}
                      </td>
                      <td style={{color: 'var(--text-secondary)'}}>
                        {formatTime(getUnitProductionTime(baseFt))}
                      </td>
                      <td style={{color: 'var(--text-secondary)'}}>R$ {res.despesasProducao.toFixed(2)}</td>
                      <td style={{color: 'var(--danger)'}}>R$ {res.despesasVenda.toFixed(2)}</td>
                      <td><strong>R$ {res.custoUnitario.toFixed(2)}</strong></td>
                      <td>
                         <div className="input-wrapper" style={{maxWidth: '120px', margin: '0 auto'}}>
                            <span className="prefix" style={{color: 'var(--accent-primary)', fontWeight: 'bold'}}>R$</span>
                            <input 
                              type="number"
                              min="0"
                              step="any"
                              className="has-prefix"
                              style={{color: 'var(--accent-primary)', fontWeight: 'bold'}}
                              value={channelFt.precoVendaManual !== undefined ? channelFt.precoVendaManual : ''}
                              placeholder="0.00"
                              onChange={(e) => handlePriceChange(baseFt.indiceFt, e.target.value)}
                            />
                         </div>
                      </td>
                      <td>
                        <strong style={{color: res.margemContribuicaoPerc > 0 ? 'var(--success)' : (res.margemContribuicaoPerc === 0 ? 'var(--text-secondary)' : 'var(--danger)')}}>
                           {res.margemContribuicaoPerc.toFixed(1)}%
                        </strong>
                      </td>
                      <td>
                        <strong style={{color: res.lucroLiquido >= 0 ? 'var(--success)' : 'var(--danger)'}}>
                          R$ {res.lucroLiquido.toFixed(2)}
                        </strong>
                      </td>
                      
                      <td style={{textAlign: 'center'}}>
                         <input 
                           type="number"
                           min="0"
                           className="qty-input"
                           value={qty === 0 ? '' : qty}
                           placeholder="0"
                           onChange={(e) => handleQtyChange(baseFt.indiceFt, e.target.value)}
                         />
                      </td>

                      <td style={{textAlign: 'right'}}>
                        <div style={{display: 'flex', gap: '8px', justifyContent: 'flex-end'}}>
                          <button 
                            className="btn-icon sync-btn" 
                            title="Sincronizar esta FT"
                            onClick={() => handleSync(baseFt.indiceFt)}
                          >
                            <RefreshCw size={14} />
                          </button>
                          <button className="btn-icon adjust-btn" onClick={() => handleOpenOverride(baseFt)} title="Config. do Canal">
                             <Settings size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {editingOverride && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
               <div>
                  <h3>Ajustar {CHANNELS.find(c => c.id === activeChannel)?.label}</h3>
                  <p>Alterações aqui se aplicam apenas a: <strong>{editingOverride.ftBase.nomePeca} ({editingOverride.ftBase.indiceFt})</strong> neste respectivo canal.</p>
               </div>
               <button className="btn-icon" onClick={() => setEditingOverride(null)}><X size={24}/></button>
            </div>

            <div className="modal-body" style={{maxHeight: '75vh'}}>
               <div className="modal-layout-split">
                  <div className="modal-physical-info">
                     <h4 style={{marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase'}}>Custos de Produção (Fixo)</h4>
                     <div className="costs-summary-small">
                        {(() => {
                           const res = getResultados(editingOverride.customData);
                           return (
                             <>
                               <div className="cost-item-mini">
                                 <span>Material (Unit):</span>
                                 <strong>R$ {res.custoMaterialUnit.toFixed(2)}</strong>
                               </div>
                               <div className="cost-item-mini">
                                 <span>Energia (Unit):</span>
                                 <strong>R$ {res.custoEnergiaUnit.toFixed(2)}</strong>
                               </div>
                               <div className="cost-item-mini">
                                 <span>Depreciação Maq (Unit):</span>
                                 <strong>R$ {res.custoMaquinaUnit.toFixed(2)}</strong>
                               </div>
                               <div className="cost-item-mini">
                                 <span>Gastos Extras (Unit):</span>
                                 <strong>R$ {res.custosExtrasAdic.toFixed(2)}</strong>
                               </div>
                               <div className="cost-divider-mini"></div>
                               <div className="cost-item-mini total">
                                 <span>Custo Produção Unit:</span>
                                 <strong>R$ {res.custoFisicoUnit.toFixed(2)}</strong>
                               </div>
                               
                               <div style={{marginTop: '1.5rem', padding: '0.8rem', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)'}}>
                                  <div style={{fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '5px'}}>PROPRIEDADES FÍSICAS (UNIT)</div>
                                  <div style={{fontSize: '0.85rem', marginBottom: '8px'}}>⚖️ Peso Bruto: {(parseNumber(editingOverride.ftBase.pesoGramas) / Math.max(1, parseNumber(editingOverride.ftBase.quantidade))).toFixed(1)}g</div>
                                  <div style={{fontSize: '0.85rem', marginBottom: '8px'}}>⏱️ Impressão: {formatTime(getUnitProductionTime(editingOverride.ftBase))}</div>
                                  
                                  <div style={{fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginTop: '15px', marginBottom: '5px'}}>LOGÍSTICA E EMBALAGEM</div>
                                  <div style={{fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px'}}>
                                    <span>📦 <strong>Sem Caixa:</strong> {editingOverride.ftBase.medidaSemCaixa || '--'} ({editingOverride.ftBase.pesoSemCaixa ? editingOverride.ftBase.pesoSemCaixa + 'g' : '--'})</span>
                                    <span>🏷️ <strong>Com Caixa:</strong> {editingOverride.ftBase.medidaComCaixa || '--'} ({editingOverride.ftBase.pesoComCaixa ? editingOverride.ftBase.pesoComCaixa + 'g' : '--'})</span>
                                  </div>
                               </div>
                             </>
                           );
                        })()}
                     </div>
                  </div>

                  <div className="modal-sales-settings">
                     <h4 style={{marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase'}}>Configurações de Venda ({activeChannel})</h4>
                     <div className="override-grid">
                        <div className="input-group">
                          <label>Embalagem</label>
                          <div className="input-wrapper">
                            <span className="prefix">R$</span>
                            <input type="number" step="any" name="custoEmbalagem" className="has-prefix" value={editingOverride.customData.custoEmbalagem ?? ''} onChange={handleOverrideChange} />
                          </div>
                        </div>
                        <div className="input-group">
                          <label>Extras Venda</label>
                          <div className="input-wrapper">
                            <span className="prefix">R$</span>
                            <input type="number" step="any" name="custoExtra" className="has-prefix" value={editingOverride.customData.custoExtra ?? ''} onChange={handleOverrideChange} />
                          </div>
                        </div>
                        <div className="input-group">
                          <label>Envio/Frete</label>
                           <div className="input-wrapper">
                            <span className="prefix">R$</span>
                            <input type="number" step="any" name="custoEnvio" className="has-prefix" value={editingOverride.customData.custoEnvio ?? ''} onChange={handleOverrideChange} />
                          </div>
                        </div>
                        <div className="input-group">
                          <label>Taxa Fixa Venda</label>
                          <div className="input-wrapper">
                            <span className="prefix">R$</span>
                            <input type="number" step="any" name="taxaFixaVenda" className="has-prefix" value={editingOverride.customData.taxaFixaVenda ?? ''} onChange={handleOverrideChange} />
                          </div>
                        </div>
                        <div className="input-group">
                          <label>Nota Fiscal</label>
                          <div className="input-wrapper">
                            <span className="suffix">%</span>
                            <input type="number" step="any" name="impostosNF" className="has-suffix" value={editingOverride.customData.impostosNF ?? ''} onChange={handleOverrideChange} />
                          </div>
                        </div>
                        <div className="input-group">
                          <label>Taxa Plataforma</label>
                          <div className="input-wrapper">
                            <span className="suffix">%</span>
                            <input type="number" step="any" name="taxaMLPerc" className="has-suffix" value={editingOverride.customData.taxaMLPerc ?? ''} onChange={handleOverrideChange} />
                          </div>
                        </div>
                        <div className="input-group override-highlight" style={{borderColor: 'var(--border-color)', opacity: 0.7}}>
                          <label>Markup Ativo</label>
                          <div className="input-wrapper">
                            <span className="prefix">✖</span>
                            <input type="text" disabled className="has-prefix" value={getResultados(editingOverride.customData).precoSugerido > 0 ? (getResultados(editingOverride.customData).precoSugerido / getResultados(editingOverride.customData).custoUnitario).toFixed(2) : '0.00'} />
                          </div>
                        </div>
                        <div className="input-group override-highlight" style={{borderColor: 'var(--border-color)', opacity: 0.7}}>
                          <label>Preço Sugerido</label>
                          <div className="input-wrapper">
                            <span className="prefix">R$</span>
                            <input type="text" disabled className="has-prefix" value={getResultados(editingOverride.customData).precoSugerido.toFixed(2)} />
                          </div>
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            <div className="modal-footer" style={{justifyContent: 'space-between'}}>
               <button className="btn-secondary" onClick={handleResetOverride} style={{color: 'var(--danger)', borderColor: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px'}}>
                 🗑️ Resetar Regras
               </button>
               <div style={{display: 'flex', gap: '10px'}}>
                 <button className="btn-secondary" onClick={() => setEditingOverride(null)}>Cancelar</button>
                 <button className="btn-primary" onClick={saveOverrideModal}><Save size={18}/> Salvar Substituição Local</button>
               </div>
            </div>
          </div>
        </div>
      )}

      {editingGlobal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
               <div>
                  <h3>⚙️ Configurações Gerais - {CHANNELS.find(c => c.id === activeChannel)?.label}</h3>
                  <p>Defina o formato de comissão, imposto e precificação <strong>PADRÃO</strong> para todas as peças vendidas neste canal.</p>
               </div>
               <button className="btn-icon" onClick={() => setEditingGlobal(false)}><X size={24}/></button>
            </div>

            <div className="modal-body">
               <div className="override-grid">
                  <div className="input-group">
                    <label>Embalagem Padrão</label>
                    <div className="input-wrapper">
                      <span className="prefix">R$</span>
                      <input type="number" step="any" name="custoEmbalagem" className="has-prefix" value={globalFormData.custoEmbalagem ?? ''} onChange={handleGlobalChange} />
                    </div>
                  </div>
                  <div className="input-group">
                    <label>Extras Padrão</label>
                     <div className="input-wrapper">
                      <span className="prefix">R$</span>
                      <input type="number" step="any" name="custoExtra" className="has-prefix" value={globalFormData.custoExtra ?? ''} onChange={handleGlobalChange} />
                    </div>
                  </div>
                  <div className="input-group">
                    <label>Envio/Frete Fixo</label>
                    <div className="input-wrapper">
                      <span className="prefix">R$</span>
                      <input type="number" step="any" name="custoEnvio" className="has-prefix" value={globalFormData.custoEnvio ?? ''} onChange={handleGlobalChange} />
                    </div>
                  </div>
                  <div className="input-group">
                    <label>Taxa Fixa Venda</label>
                     <div className="input-wrapper">
                      <span className="prefix">R$</span>
                      <input type="number" step="any" name="taxaFixaVenda" className="has-prefix" value={globalFormData.taxaFixaVenda ?? ''} onChange={handleGlobalChange} />
                    </div>
                  </div>
                  <div className="input-group">
                    <label>Nota Fiscal</label>
                    <div className="input-wrapper">
                      <span className="suffix">%</span>
                      <input type="number" step="any" name="impostosNF" className="has-suffix" value={globalFormData.impostosNF ?? ''} onChange={handleGlobalChange} />
                    </div>
                  </div>
                  <div className="input-group">
                    <label>Taxa Master Plataforma</label>
                    <div className="input-wrapper">
                      <span className="suffix">%</span>
                      <input type="number" step="any" name="taxaMLPerc" className="has-suffix" value={globalFormData.taxaMLPerc ?? ''} onChange={handleGlobalChange} />
                    </div>
                  </div>
                  <div className="input-group override-highlight" style={{gridColumn: 'span 2', textAlign: 'center'}}>
                    <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '1rem'}}>
                      * O modelo de Preço por Markup foi substituído pela entrada direta de Preço na Tabela Principal.
                    </p>
                  </div>
               </div>
            </div>

            <div className="modal-footer">
               <button className="btn-secondary" onClick={() => setEditingGlobal(false)}>Cancelar</button>
               <button className="btn-primary" onClick={saveGlobalModal}><Save size={18}/> Salvar Regra Mestre</button>
            </div>
          </div>
        </div>
      )}
      {showReport && (
        <MonthlyReportOverlay 
          month={currentMonth} 
          vendasMensal={vendasMensal[currentMonth] || {}} 
          savedFts={savedFts}
          overrides={overrides}
          channelDefaults={channelDefaults}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

function MonthlyReportOverlay({ month, vendasMensal, savedFts, overrides, channelDefaults, onClose }) {
  const [year, monthNum] = month.split('-');
  const monthName = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][parseInt(monthNum)-1];

  const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  // Helper para fundir config base com config do canal atual (vindo das props)
  const getFtWithOverridesForReport = (ftBase, channelId) => {
    const physicalFT = {
       indiceFt: ftBase.indiceFt,
       nomePeca: ftBase.nomePeca,
       quantidade: ftBase.quantidade,
       pesoGramas: ftBase.pesoGramas,
       tempoImpressao: ftBase.tempoImpressao,
       precoKgMaterial: ftBase.precoKgMaterial,
       custoKwh: ftBase.custoKwh,
       custoDepreciacao: ftBase.custoDepreciacao,
       extraValor1: ftBase.extraValor1,
       extraValor2: ftBase.extraValor2,
       extraValor3: ftBase.extraValor3
    };
    const defaults = channelDefaults[channelId] || {
      custoEmbalagem: 1.5, custoExtra: 0, custoEnvio: 0,
      taxaFixaVenda: 0, impostosNF: 0, taxaMLPerc: 0, markup: 3
    };
    const channelOps = overrides[channelId]?.[ftBase.indiceFt] || {};
    return { ...physicalFT, ...defaults, ...channelOps }; 
  };

  // Agrega dados
  const reportData = [];
  let grandTotalRevenue = 0;
  let grandTotalProfit = 0;
  let grandTotalItems = 0;

  Object.entries(vendasMensal).forEach(([channelId, ftsQty]) => {
    const channelLabel = CHANNELS.find(c => c.id === channelId)?.label || channelId;
    const channelItems = [];
    let channelRevenue = 0;
    let channelProfit = 0;

    Object.entries(ftsQty).forEach(([ftId, qty]) => {
      if (qty <= 0) return;
      const baseFt = savedFts.find(f => f.indiceFt === ftId);
      if (!baseFt) return;

      const merged = getFtWithOverridesForReport(baseFt, channelId);
      const res = getResultados(merged);

      const itemRevenue = res.precoSugerido * qty;
      const itemProfit = res.lucroLiquido * qty;

      channelItems.push({
        id: ftId,
        nome: baseFt.nomePeca,
        qty,
        precoUnit: res.precoSugerido,
        lucroUnit: res.lucroLiquido,
        subtotal: itemRevenue,
        lucroTotal: itemProfit
      });

      channelRevenue += itemRevenue;
      channelProfit += itemProfit;
      grandTotalItems += qty;
    });

    if (channelItems.length > 0) {
      reportData.push({
        channelId,
        channelLabel,
        items: channelItems,
        revenue: channelRevenue,
        profit: channelProfit
      });
      grandTotalRevenue += channelRevenue;
      grandTotalProfit += channelProfit;
    }
  });

  return (
    <div className="report-overlay">
      <div className="report-container">
        <header className="report-header no-print">
          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
            <CheckCircle2 size={32} color="var(--success)" />
            <div>
              <h2 style={{margin: 0}}>Fechamento de Mês</h2>
              <p style={{margin: 0, opacity: 0.8}}>{monthName} de {year}</p>
            </div>
          </div>
          <div style={{display: 'flex', gap: '10px'}}>
            <button className="btn-secondary" onClick={() => window.print()} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              <Printer size={18} /> Imprimir / PDF
            </button>
            <button className="btn-icon" onClick={onClose} style={{background: 'rgba(255,255,255,0.1)', color: 'white', borderRadius: '50%'}}><X size={24}/></button>
          </div>
        </header>

        <main className="report-main">
          {/* Cabeçalho de Impressão (Só aparece no papel) */}
          <div className="print-only-header">
            <h1 style={{textAlign: 'center', marginBottom: '0.5rem'}}>Relatório de Fechamento Mensal</h1>
            <p style={{textAlign: 'center', marginBottom: '2rem'}}>Período: {monthName} / {year} | AM3D Soluções</p>
          </div>

          <div className="report-summary-cards">
            <div className="card r-stat">
              <span>Faturamento Total</span>
              <h2>{formatCurrency(grandTotalRevenue)}</h2>
            </div>
            <div className="card r-stat highlight">
              <span>Lucro Líquido Estimado</span>
              <h2 style={{color: 'var(--success)'}}>{formatCurrency(grandTotalProfit)}</h2>
            </div>
            <div className="card r-stat">
              <span>Total de Itens Vendidos</span>
              <h2>{grandTotalItems} <small>un</small></h2>
            </div>
          </div>

          <div className="report-details-sections">
            {reportData.length === 0 ? (
              <div style={{textAlign: 'center', padding: '4rem'}}>Nenhuma venda registrada neste mês.</div>
            ) : (
              reportData.map(group => (
                <div key={group.channelId} className="report-channel-block">
                  <div className="r-channel-header">
                    <h3>{group.channelLabel}</h3>
                    <div className="r-channel-totals">
                        <span>Faturamento: <strong>{formatCurrency(group.revenue)}</strong></span>
                        <span style={{marginLeft: '20px'}}>Lucro: <strong style={{color: 'var(--success)'}}>{formatCurrency(group.profit)}</strong></span>
                    </div>
                  </div>
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Cód</th>
                        <th>Produto / Peça</th>
                        <th style={{textAlign: 'center'}}>Qtd</th>
                        <th style={{textAlign: 'right'}}>Preço Unit.</th>
                        <th style={{textAlign: 'right'}}>Preço Total</th>
                        <th style={{textAlign: 'right'}}>Lucro Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map(item => (
                        <tr key={item.id}>
                          <td style={{width: '60px'}}><span className="badge">{item.id}</span></td>
                          <td style={{fontWeight: '500'}}>{item.nome}</td>
                          <td style={{textAlign: 'center'}}>{item.qty}</td>
                          <td style={{textAlign: 'right'}}>{formatCurrency(item.precoUnit)}</td>
                          <td style={{textAlign: 'right', fontWeight: 'bold'}}>{formatCurrency(item.subtotal)}</td>
                          <td style={{textAlign: 'right', color: 'var(--success)'}}>{formatCurrency(item.lucroTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
        </main>

        <footer className="report-footer no-print">
          <p>Relatório gerado em {new Date().toLocaleString('pt-BR')}</p>
        </footer >
      </div>
    </div>
  );
}
