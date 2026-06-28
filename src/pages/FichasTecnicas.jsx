import { useState, useEffect } from 'react';
import FtInputs from '../components/fichas/FtInputs';
import FtResults from '../components/fichas/FtResults';
import { parseTime, parseNumber, getCustoUnitario, getResultados, getUnitProductionTime, formatTime } from '../utils/financeCalculators';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Loader } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import './FichasTecnicas.css';

const INITIAL_STATE = {
  indiceFt: 'FT-01',
  nomePeca: 'Nova Impressão',
  quantidade: 1,
  pesoGramas: 50,
  tempoImpressao: '01:30', 
  precoKgMaterial: 120, 
  custoKwh: 0.95, 
  custoDepreciacao: 0.50,
  // Gastos Extras
  extraNome1: '', extraValor1: '',
  extraNome2: '', extraValor2: '',
  extraNome3: '', extraValor3: '',
  
  // Informações de Logística / Embalagem
  medidaSemCaixa: '',
  pesoSemCaixa: '',
  medidaComCaixa: '',
  pesoComCaixa: '',
};

const getNextFtId = (listaAtual) => {
  if (!listaAtual) return 'FT-01';
  for (let i = 1; i <= 150; i++) {
     const id = `FT-${String(i).padStart(2, '0')}`;
     if (!listaAtual.find(item => item.indiceFt === id)) {
         return id;
     }
  }
  return 'FT-151';
};

export default function FichasTecnicas() {
  const { profile } = useAuth();
  const [savedFts, setSavedFts] = useState([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [semDados, setSemDados] = useState(false);

  const [inputs, setInputs] = useState({ ...INITIAL_STATE });
  const [activeTab, setActiveTab] = useState('single'); // 'single' ou 'kit'
  const [searchTerm, setSearchTerm] = useState('');
  const [kitItems, setKitItems] = useState([]); // [{ ftId, qty }]

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: 'save', title: '', details: [], onConfirm: null });
  const openConfirm = (type, title, details, onConfirm) => setConfirmModal({ isOpen: true, type, title, details, onConfirm });
  const closeConfirm = () => setConfirmModal(m => ({ ...m, isOpen: false }));

  // Estados de Insumos / Gastos Extras Pré-Cadastrados
  const [insumos, setInsumos] = useState([]);
  const [showInsumosManager, setShowInsumosManager] = useState(false);
  const [selectInsumoIndex, setSelectInsumoIndex] = useState(null);
  const [newInsumo, setNewInsumo] = useState({ nome: '', valor: '' });

  useEffect(() => {
    fetchFichas();
    fetchInsumos();

    const channelFts = supabase
      .channel('realtime-fichas')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fichas_tecnicas' },
        () => {
          fetchFichas();
        }
      )
      .subscribe();

    const channelInsumos = supabase
      .channel('realtime-insumos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'insumos_base' },
        () => {
          fetchInsumos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelFts);
      supabase.removeChannel(channelInsumos);
    };
  }, []);

  const fetchInsumos = async () => {
    try {
      const { data, error } = await supabase
        .from('insumos_base')
        .select('*')
        .order('nome', { ascending: true });
      if (!error && data) {
        setInsumos(data);
      }
    } catch (e) {
      console.error("Erro ao buscar insumos:", e);
    }
  };

  const handleAddInsumo = async (e) => {
    e.preventDefault();
    if (!newInsumo.nome.trim() || !newInsumo.valor) return;
    try {
      const empId = profile?.empresa_id || 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9';
      const { error } = await supabase
        .from('insumos_base')
        .insert({
          nome: newInsumo.nome,
          valor: parseFloat(newInsumo.valor),
          empresa_id: empId
        });
      if (error) throw error;
      setNewInsumo({ nome: '', valor: '' });
      fetchInsumos();
    } catch (e) {
      alert("Erro ao adicionar insumo: " + e.message);
    }
  };

  const handleDeleteInsumo = async (id) => {
    if (!window.confirm("Deseja mesmo excluir este insumo?")) return;
    try {
      const { error } = await supabase
        .from('insumos_base')
        .delete()
        .eq('id', id);
      if (error) throw error;
      fetchInsumos();
    } catch (e) {
      alert("Erro ao excluir insumo: " + e.message);
    }
  };

  const handleSelectInsumo = (insumo) => {
    if (selectInsumoIndex === null) return;
    setInputs(prev => ({
      ...prev,
      [`extraNome${selectInsumoIndex}`]: insumo.nome,
      [`extraValor${selectInsumoIndex}`]: insumo.valor
    }));
    setSelectInsumoIndex(null);
  };

  const fetchFichas = async () => {
    setLoadingDb(true);
    setSemDados(false);
    
    try {
      // Usa o Supabase client diretamente — ele injeta o JWT do usuário autenticado
      // satisfazendo a política RLS: empresa_id = get_user_empresa_id()
      const { data, error } = await supabase
        .from('fichas_tecnicas')
        .select('*')
        .order('id', { ascending: true });

      if (error) {
        console.error('[FichasTecnicas] Erro ao buscar FTs:', error);
        setSemDados(true);
        return;
      }

      const safeData = data || [];
      console.log(`[FichasTecnicas] Banco retornou ${safeData.length} registros.`);

      if (safeData.length === 0) {
        setSavedFts([]);
        setSemDados(true);
      } else {
        setSavedFts(safeData.map(r => r.data));
        setInputs(prev => ({ ...prev, indiceFt: getNextFtId(safeData.map(r => r.data)) }));
      }
    } catch (e) {
      console.error('[FichasTecnicas] Exceção ao buscar FTs:', e);
      setSemDados(true);
    } finally {
      setLoadingDb(false);
    }
  };

  // Importar backup JSON manualmente
  const handleImportJson = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        const lista = Array.isArray(json) ? json : (json.fichas_tecnicas || json.am3d_saved_fts || []);
        if (!lista.length) return alert('Nenhuma FT encontrada no arquivo.');

        setIsMigrating(true);
        const inserts = lista.map(ft => ({
          id: ft.indiceFt || ft.id,
          name: ft.nomePeca || ft.name || 'Sem Nome',
          cost: ft._custoFinal || ft.cost || 0,
          data: ft.data || ft
        }));

        const { error } = await supabase
          .from('fichas_tecnicas')
          .upsert(inserts, { onConflict: 'id' });

        if (error) { alert('Erro ao importar: ' + error.message); setIsMigrating(false); return; }
        alert(`✅ ${inserts.length} Fichas Técnicas importadas com sucesso!`);
        await fetchFichas();
      } catch {
        alert('Arquivo inválido. Use um JSON exportado pelo sistema.');
        setIsMigrating(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleChange = (e) => {
    let { name, value } = e.target;
    
    if (name === "indiceFt") {
      const ftExistente = savedFts.find(ft => ft.indiceFt === value);
      if (ftExistente) {
        if (window.confirm(`A ficha técnica ${value} já possui dados salvos ("${ftExistente.nomePeca}"). Deseja carregar os dados para edição?`)) {
          // Remove campos vazios para que o INITIAL_STATE prevaleça
          const cleanFt = Object.fromEntries(Object.entries(ftExistente).filter(([_, v]) => v !== '' && v !== null && v !== undefined));
          setInputs({ ...INITIAL_STATE, ...cleanFt });
          setActiveTab('single');
          return;
        }
      }
      setInputs(prev => ({...prev, indiceFt: value}));
      return;
    }

    if (typeof value === 'string') {
      value = value.replace(',', '.');
    }

    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const resultados = getResultados(inputs);

  const recalculateKit = (kit, freshFts) => {
    if (!kit.isKit || !kit.components || kit.components.length === 0) return kit;

    const summary = kit.components.reduce((acc, item) => {
      const ft = freshFts.find(f => f.indiceFt === item.ftId);
      if (!ft) return acc;
      
      const unitTime = getUnitProductionTime(ft);
      const unitWeight = parseNumber(ft.pesoGramas) / Math.max(1, parseNumber(ft.quantidade));
      const extraCosts = parseNumber(ft.extraValor1 || 0) + parseNumber(ft.extraValor2 || 0) + parseNumber(ft.extraValor3 || 0);

      acc.peso += unitWeight * (item.qty || 1);
      acc.tempo += unitTime * (item.qty || 1);
      acc.extra += extraCosts * (item.qty || 1);
      return acc;
    }, { peso: 0, tempo: 0, extra: 0 });

    const updatedKitInputs = {
      ...kit,
      pesoGramas: summary.peso.toFixed(1),
      tempoImpressao: formatTime(summary.tempo),
      extraValor1: summary.extra.toFixed(2),
    };

    const freshResultados = getResultados(updatedKitInputs);

    return {
      ...updatedKitInputs,
      _custoFinal: freshResultados.custoFisicoUnit
    };
  };

  const handleSaveFt = async () => {
    if (!inputs.indiceFt.trim()) return alert('O Índice da FT não pode estar vazio.');
    
    const isNewFt = !savedFts.some(item => item.indiceFt === inputs.indiceFt);
    if (isNewFt) {
      const limit = profile?.tenants?.limit_fts ?? 50;
      if (savedFts.length >= limit) {
        return alert(`⚠️ Limite Atingido: A sua empresa atingiu o limite de ${limit} Fichas Técnicas cadastradas para o seu plano.`);
      }
    }

    const ftData = { ...inputs, _custoFinal: resultados.custoFisicoUnit };

    openConfirm(
      isNewFt ? 'save' : 'edit',
      isNewFt ? 'Salvar Nova Ficha Técnica' : 'Atualizar Ficha Técnica',
      [
        { label: 'ID', value: inputs.indiceFt },
        { label: 'Nome', value: inputs.nomePeca || '—' },
        { label: 'Peso', value: (inputs.pesoGramas || '0') + 'g' },
        { label: 'Tempo de Impressão', value: inputs.tempoImpressao || '—' },
        { label: 'Custo Unitário', value: 'R$ ' + (resultados.custoFisicoUnit || 0).toFixed(2) },
      ],
      async () => {
        closeConfirm();

        let novaLista = [];
        setSavedFts(prev => {
          const idx = prev.findIndex(item => item.indiceFt === inputs.indiceFt);
          novaLista = [...prev];
          if (idx >= 0) {
            novaLista[idx] = ftData;
          } else {
            novaLista.push(ftData);
          }
          novaLista = novaLista.map(item => {
            if (item.isKit && item.components && item.components.some(c => c.ftId === ftData.indiceFt || novaLista.some(f => f.indiceFt === c.ftId))) {
              return recalculateKit(item, novaLista);
            }
            return item;
          });
          setTimeout(() => {
            setInputs(c => ({
              ...c,
              indiceFt: getNextFtId(novaLista),
              nomePeca: '',
              quantidade: 1,
              pesoGramas: '',
              tempoImpressao: '',
              extraNome1: '', extraValor1: '',
              extraNome2: '', extraValor2: '',
              extraNome3: '', extraValor3: '',
              medidaSemCaixa: '', pesoSemCaixa: '',
              medidaComCaixa: '', pesoComCaixa: '',
              isKit: false,
              components: []
            }));
          }, 100);
          return novaLista;
        });

        const { error: saveError } = await supabase
          .from('fichas_tecnicas')
          .upsert(
            { id: ftData.indiceFt, name: ftData.nomePeca, cost: ftData._custoFinal, data: ftData },
            { onConflict: 'id' }
          );

        if (saveError) {
          console.error('[FichasTecnicas] Erro ao salvar FT:', saveError);
          alert('Erro ao salvar no banco: ' + saveError.message);
          return;
        }

        const updatedKits = novaLista.filter(item => {
          if (!item.isKit) return false;
          const oldKit = savedFts.find(k => k.indiceFt === item.indiceFt);
          return !oldKit || oldKit._custoFinal !== item._custoFinal || oldKit.pesoGramas !== item.pesoGramas;
        });

        for (const kit of updatedKits) {
          await supabase
            .from('fichas_tecnicas')
            .upsert(
              { id: kit.indiceFt, name: kit.nomePeca, cost: kit._custoFinal, data: kit },
              { onConflict: 'id' }
            );
        }
      }
    );
  };

  const handleEdit = (ft) => {
    const cleanFt = Object.fromEntries(Object.entries(ft).filter(([_, v]) => v !== '' && v !== null && v !== undefined));
    setInputs({ ...INITIAL_STATE, ...cleanFt });
    setActiveTab('single');
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Sobe a tela suavemente
  };

  const handleClearForm = () => {
    openConfirm(
      'delete',
      'Limpar Formulário',
      [
        { label: 'Aviso', value: 'Todas as modificações não salvas do formulário atual serão perdidas.' },
        { label: 'Indice da FT', value: inputs.indiceFt }
      ],
      () => {
        closeConfirm();
        executeClearForm();
      }
    );
  };

  const executeClearForm = () => {
    setInputs(c => ({
      ...INITIAL_STATE,
      indiceFt: getNextFtId(savedFts),
      nomePeca: '',
      quantidade: 1,
      pesoGramas: '',
      tempoImpressao: '',
      extraNome1: '', extraValor1: '',
      extraNome2: '', extraValor2: '',
      extraNome3: '', extraValor3: '',
      medidaSemCaixa: '', pesoSemCaixa: '',
      medidaComCaixa: '', pesoComCaixa: '',
      isKit: false,
      components: []
    }));
    setKitItems([]);
  };

  const handleDelete = async (id) => {
    const ft = savedFts.find(f => f.indiceFt === id);
    openConfirm(
      'delete',
      'Excluir Ficha Técnica',
      [
        { label: 'ID', value: id },
        { label: 'Nome', value: ft?.nomePeca || '—' },
        { label: 'Custo Unitário', value: ft?._custoFinal ? 'R$ ' + ft._custoFinal.toFixed(2) : '—' },
      ],
      async () => {
        closeConfirm();
        let novaLista = [];
        setSavedFts(prev => {
          const filtrada = prev.filter(f => f.indiceFt !== id);
          novaLista = filtrada.map(item => {
            if (item.isKit && item.components && item.components.some(c => c.ftId === id)) {
              const updatedComponents = item.components.filter(c => c.ftId !== id);
              const updatedKit = { ...item, components: updatedComponents };
              return recalculateKit(updatedKit, filtrada);
            }
            return item;
          });
          setInputs(c => ({...c, indiceFt: getNextFtId(novaLista)}));
          return novaLista;
        });

        const { error: deleteError } = await supabase
          .from('fichas_tecnicas')
          .delete()
          .eq('id', id);

        if (deleteError) {
          console.error('[FichasTecnicas] Erro ao deletar FT:', deleteError);
          alert('Erro ao deletar: ' + deleteError.message);
          return;
        }

        const kitsParaAtualizar = novaLista.filter(item => {
          if (!item.isKit) return false;
          const oldKit = savedFts.find(k => k.indiceFt === item.indiceFt);
          return oldKit && oldKit.components?.length !== item.components?.length;
        });

        for (const kit of kitsParaAtualizar) {
          await supabase
            .from('fichas_tecnicas')
            .upsert(
              { id: kit.indiceFt, name: kit.nomePeca, cost: kit._custoFinal, data: kit },
              { onConflict: 'id' }
            );
        }
      }
    );
  };

  // --- Lógica de Kits ---
  const toggleKitItem = (ftId) => {
    setKitItems(prev => {
      const exists = prev.find(item => item.ftId === ftId);
      if (exists) return prev.filter(item => item.ftId !== ftId);
      return [...prev, { ftId, qty: 1 }];
    });
  };

  const updateKitQty = (ftId, qty) => {
    setKitItems(prev => prev.map(item => item.ftId === ftId ? { ...item, qty: parseInt(qty) || 1 } : item));
  };

  const kitSummary = kitItems.reduce((acc, item) => {
    const ft = savedFts.find(f => f.indiceFt === item.ftId);
    if (!ft) return acc;
    
    const unitTime = getUnitProductionTime(ft);
    const unitWeight = parseNumber(ft.pesoGramas) / Math.max(1, parseNumber(ft.quantidade));
    const extraCosts = parseNumber(ft.extraValor1 || 0) + parseNumber(ft.extraValor2 || 0) + parseNumber(ft.extraValor3 || 0);

    acc.peso += unitWeight * (item.qty || 1);
    acc.tempo += unitTime * (item.qty || 1);
    acc.extra += extraCosts * (item.qty || 1);
    return acc;
  }, { peso: 0, tempo: 0, extra: 0 });

  const handleGenerateKitFt = () => {
    if (kitItems.length === 0) return alert("Selecione ao menos um item para o kit.");
    
    // Preenche o formulário com os dados somados e os metadados do kit
    setInputs(prev => ({
      ...prev,
      nomePeca: `KIT: ${kitItems.map(item => {
        const ft = savedFts.find(f => f.indiceFt === item.ftId);
        return `${item.qty}x ${ft?.nomePeca || item.ftId}`;
      }).join(' + ')}`.substring(0, 50),
      pesoGramas: kitSummary.peso.toFixed(1),
      tempoImpressao: formatTime(kitSummary.tempo),
      quantidade: 1,
      extraNome1: 'Custo Agregado Kit',
      extraValor1: kitSummary.extra.toFixed(2),
      extraNome2: '', extraValor2: '',
      extraNome3: '', extraValor3: '',
      medidaSemCaixa: '', pesoSemCaixa: '',
      medidaComCaixa: '', pesoComCaixa: '',
      isKit: true,
      components: kitItems
    }));
    
    setActiveTab('single');
    alert("Dados do Kit gerados! Revise e clique em 'Salvar Ficha Técnica' para finalizar.");
  };

  const filteredFts = savedFts.filter(ft => {
    const nome = ft.nomePeca ? String(ft.nomePeca).toLowerCase() : "";
    const id = ft.indiceFt ? String(ft.indiceFt).toLowerCase() : "";
    const search = searchTerm.toLowerCase();
    return nome.includes(search) || id.includes(search);
  });

  return (
    <div className="page-wrapper fichas-page">
      <div className="fichas-header">
        <div>
          <h1 className="page-title">Mestre de Fichas Técnicas (Produção Física)</h1>
          <p className="page-description">Gerencie as propriedades físicas das peças. Precificação e vendas são definidas no painel Multi-Canal.</p>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '10px' }}>
          {activeTab === 'single' && (
            <>
              <button className="btn-secondary" onClick={handleClearForm} style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Limpar Formulário</button>
              <button className="btn-primary" onClick={handleSaveFt}>Salvar Ficha Técnica</button>
            </>
          )}
          {activeTab === 'kit' && (
            <button className="btn-primary" onClick={handleGenerateKitFt}>Gerar FT do Kit</button>
          )}
        </div>
      </div>

      <div className="tabs-container">
        <button 
          className={`tab-btn ${activeTab === 'single' ? 'active' : ''}`} 
          onClick={() => setActiveTab('single')}
        >
          ✨ Nova Peça Individual
        </button>
        <button 
          className={`tab-btn ${activeTab === 'kit' ? 'active' : ''}`} 
          onClick={() => setActiveTab('kit')}
        >
          📦 Criar Novo Kit
        </button>
      </div>
      
      {activeTab === 'single' ? (
        <div className="fichas-grid">
          <div className="fichas-left">
            <FtInputs 
              inputs={inputs} 
              onChange={handleChange} 
              savedFts={savedFts}
              onManageInsumos={() => setShowInsumosManager(true)}
              onSelectInsumoClick={(index) => setSelectInsumoIndex(index)}
            />
          </div>
          <div className="fichas-right">
            <FtResults results={resultados} inputs={inputs} />
          </div>
        </div>
      ) : (
        <div className="kit-builder-grid">
          <div className="card kit-selection">
            <h3>Escolha as peças para o Kit</h3>
            <div className="kit-search-mini">
              <input 
                type="text" 
                placeholder="Filtrar catálogo..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
            </div>
            <div className="kit-items-list">
              {filteredFts.map(ft => {
                const isSelected = kitItems.find(i => i.ftId === ft.indiceFt);
                return (
                  <div key={ft.indiceFt} className={`kit-item-row ${isSelected ? 'selected' : ''}`}>
                    <div className="item-info">
                      <span className="id">{ft.indiceFt}</span>
                      <span className="name">{ft.nomePeca}</span>
                    </div>
                    <button 
                      className={`btn-add-kit ${isSelected ? 'remove' : 'add'}`}
                      onClick={() => toggleKitItem(ft.indiceFt)}
                    >
                      {isSelected ? 'Remover' : 'Adicionar'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card kit-summary-card">
            <h3>Resumo do Combo</h3>
            {kitItems.length === 0 ? (
              <p style={{textAlign: 'center', marginTop: '2rem', color: 'var(--text-secondary)'}}>Nenhum item selecionado.</p>
            ) : (
              <>
                <div className="selected-items-scroll">
                  {kitItems.map(item => {
                    const ft = savedFts.find(f => f.indiceFt === item.ftId);
                    return (
                      <div key={item.ftId} className="selected-item-box">
                        <div className="selected-info">
                          <strong>{ft?.nomePeca}</strong>
                          <span>{ft?.indiceFt}</span>
                        </div>
                        <div className="selected-qty">
                          <label>Qtd:</label>
                          <input 
                            type="number" 
                            min="1" 
                            value={item.qty} 
                            onChange={(e) => updateKitQty(item.ftId, e.target.value)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="kit-totals-box">
                  <div className="total-row">
                    <span>Peso Total:</span>
                    <strong>{kitSummary.peso.toFixed(1)}g</strong>
                  </div>
                  <div className="total-row">
                    <span>Tempo Produção:</span>
                    <strong>{formatTime(kitSummary.tempo)}</strong>
                  </div>
                  <div className="total-row">
                    <span>Custos Extras Inclusos:</span>
                    <strong>R$ {kitSummary.extra.toFixed(2)}</strong>
                  </div>
                  <p style={{fontSize: '0.75rem', marginTop: '1rem', color: 'var(--text-secondary)'}}>
                    * Ao gerar a FT, os tempos e pesos serão agregados para formar um novo custo unitário.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Catálogo de FTs Salvas */}
      <div className="fts-list-section card" style={{marginTop: '2.5rem'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem'}}>
          <h3 style={{color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0}}>
            <span style={{fontSize: '1.4rem'}}>📚</span> Catálogo de Fichas Técnicas
          </h3>
          
          <div className="search-bar">
             <span className="search-icon">🔍</span>
             <input 
               type="text" 
               placeholder="Buscar por nome ou ID..." 
               value={searchTerm} 
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>
        </div>
        
        {loadingDb ? (
          <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)'}}>
             <Loader size={40} className="spinner" color="var(--primary)" style={{marginBottom: '1rem'}} />
             <p>Carregando banco de dados...</p>
          </div>
        ) : filteredFts.length === 0 ? (
          <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)'}}>
            {searchTerm ? (
              <p>Nenhum item encontrado para sua busca.</p>
            ) : semDados ? (
              <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'1rem', maxWidth: 480, margin: '0 auto'}}>
                <span style={{fontSize: '2.5rem'}}>⚠️</span>
                <p style={{fontWeight: 600, color: 'var(--text-primary)', margin: 0}}>Nenhum dado encontrado no banco ou no navegador</p>
                <p style={{fontSize: '0.85rem', margin: 0}}>Se você tem um backup <strong>.json</strong> exportado anteriormente, importe-o abaixo para restaurar suas Fichas Técnicas. Caso contrário, crie novas FTs pelo formulário acima.</p>
                <label style={{cursor:'pointer', background:'var(--primary)', color:'#fff', padding:'0.6rem 1.4rem', borderRadius:'8px', fontWeight:600, fontSize:'0.9rem'}}>
                  📂 Importar Backup JSON
                  <input type="file" accept=".json" onChange={handleImportJson} style={{display:'none'}} />
                </label>
              </div>
            ) : (
              <p>Nenhuma Ficha Técnica catalogada ainda.</p>
            )}
          </div>

        ) : (
          <div className="table-responsive">
            <table className="fts-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nome do Projeto</th>
                  <th>Custo Produção Físico (Unit.)</th>
                  <th style={{textAlign: 'right'}}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredFts].sort((a, b) => a.indiceFt.localeCompare(b.indiceFt)).map(ft => (
                  <tr key={ft.indiceFt}>
                    <td><span className="badge">{ft.indiceFt}</span></td>
                    <td style={{fontWeight: '600'}}>{ft.nomePeca}</td>
                    <td>R$ {ft._custoFinal?.toFixed(2)}</td>
                    <td style={{textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
                      <button onClick={() => handleEdit(ft)} style={{color: 'var(--accent-primary)', fontWeight: 'bold'}} className="btn-icon">✏️ Editar</button>
                      <button onClick={() => handleDelete(ft.indiceFt)} style={{color: 'var(--danger)', fontWeight: 'bold'}} className="btn-icon">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        type={confirmModal.type}
        title={confirmModal.title}
        details={confirmModal.details}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />

      {/* MODAL GERENCIAR INSUMOS */}
      {showInsumosManager && (
        <div className="modal-fullscreen" style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div className="card" style={{ width: '550px', maxWidth: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '1.5rem', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>⚙️ Gerenciar Insumos / Gastos Extras</h3>
              <button className="btn-icon" onClick={() => setShowInsumosManager(false)} style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            
            <form onSubmit={handleAddInsumo} style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', alignItems: 'flex-end', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <div className="form-group" style={{ flex: 2, margin: 0, textAlign: 'left' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Nome do Insumo</label>
                <input 
                  type="text" 
                  placeholder="Ex: Argola de Chaveiro" 
                  value={newInsumo.nome} 
                  onChange={e => setNewInsumo({ ...newInsumo, nome: e.target.value })} 
                  required
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                />
              </div>
              <div className="form-group" style={{ flex: 1, margin: 0, textAlign: 'left' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Valor (R$)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="0,80" 
                  value={newInsumo.valor} 
                  onChange={e => setNewInsumo({ ...newInsumo, valor: e.target.value })} 
                  required
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                />
              </div>
              <button type="submit" className="btn-primary" style={{ padding: '0.62rem 1.25rem', borderRadius: '8px', height: 'fit-content', fontWeight: '600', fontSize: '0.88rem' }}>Cadastrar</button>
            </form>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', background: 'var(--bg-primary)' }}>
              {insumos.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', margin: 0 }}>Nenhum insumo cadastrado ainda.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', fontSize: '0.85rem' }}>
                      <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Insumo</th>
                      <th style={{ padding: '0.75rem 1rem', width: '120px', color: 'var(--text-secondary)' }}>Valor</th>
                      <th style={{ padding: '0.75rem 1rem', width: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insumos.map(ins => (
                      <tr key={ins.id} style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: '500', color: 'var(--text-primary)' }}>{ins.nome}</td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: '700', color: 'var(--success)' }}>R$ {ins.valor.toFixed(2)}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          <button type="button" onClick={() => handleDeleteInsumo(ins.id)} style={{ color: 'var(--danger)', cursor: 'pointer', background: 'none', border: 'none', fontSize: '1rem' }}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL SELECIONAR INSUMO */}
      {selectInsumoIndex !== null && (
        <div className="modal-fullscreen" style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div className="card" style={{ width: '450px', maxWidth: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '1.5rem', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0 }}>Selecione um Insumo para a Linha {selectInsumoIndex}</h3>
              <button className="btn-icon" onClick={() => setSelectInsumoIndex(null)} style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', background: 'var(--bg-primary)' }}>
              {insumos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', margin: 0 }}>Você não tem insumos pré-cadastrados.</p>
                  <button className="btn-outline btn-sm" onClick={() => { setSelectInsumoIndex(null); setShowInsumosManager(true); }} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>⚙️ Cadastrar Insumos</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {insumos.map(ins => (
                    <button 
                      key={ins.id}
                      onClick={() => handleSelectInsumo(ins)}
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '1rem', 
                        borderBottom: '1px solid var(--border-color)', 
                        textAlign: 'left',
                        width: '100%',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--border-color)'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <strong style={{ color: 'var(--text-primary)' }}>{ins.nome}</strong>
                      <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>R$ {ins.valor.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
