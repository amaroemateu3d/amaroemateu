import { useState, useEffect } from 'react';
import FtInputs from '../components/fichas/FtInputs';
import FtResults from '../components/fichas/FtResults';
import { parseTime, parseNumber, getCustoUnitario, getResultados, getUnitProductionTime, formatTime } from '../utils/financeCalculators';
import { supabase } from '../supabaseClient';
import { Loader } from 'lucide-react';
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
  const [savedFts, setSavedFts] = useState([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);
  const [semDados, setSemDados] = useState(false);

  const [inputs, setInputs] = useState({ ...INITIAL_STATE });
  const [activeTab, setActiveTab] = useState('single'); // 'single' ou 'kit'
  const [searchTerm, setSearchTerm] = useState('');
  const [kitItems, setKitItems] = useState([]); // [{ ftId, qty }]

  useEffect(() => {
    fetchFichas();
  }, []);

  const fetchFichas = async () => {
    setLoadingDb(true);
    setSemDados(false);
    
    try {
      const { data, error } = await supabase.from('fichas_tecnicas').select('*').order('id', { ascending: true });
      
      if (error) {
         console.error("Erro ao buscar FTs:", error);
         return;
      }

      const safeData = data || [];
      console.log(`[FichasTecnicas] Banco retornou ${safeData.length} registros.`);

      // Estratégia de Migração Automática!
      if (safeData.length === 0) {
        const locais = localStorage.getItem('am3d_saved_fts');
        const parsedLocais = locais ? JSON.parse(locais) : [];

        if (parsedLocais.length > 0) {
          setIsMigrating(true);
          const inserts = parsedLocais.map(ft => ({
             id: ft.indiceFt,
             name: ft.nomePeca || 'Sem Nome',
             cost: ft._custoFinal || 0,
             data: ft
          }));
          
          const { error: insertErr } = await supabase.from('fichas_tecnicas').insert(inserts);
          if (insertErr) console.error("[FichasTecnicas] Erro na migração:", insertErr);
          
          const res2 = await supabase.from('fichas_tecnicas').select('*').order('id', { ascending: true });
          if (res2.data) {
             setSavedFts(res2.data.map(r => r.data));
             setInputs(prev => ({ ...prev, indiceFt: getNextFtId(res2.data.map(r => r.data)) }));
          }
          setIsMigrating(false);
        } else {
          setSavedFts([]);
          setSemDados(true);
        }
      } else {
        setSavedFts(safeData.map(r => r.data));
        setInputs(prev => ({ ...prev, indiceFt: getNextFtId(safeData.map(r => r.data)) }));
      }
    } catch (e) {
      console.error("Exceção não tratada ao buscar FTs:", e);
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
        // Suporta tanto { fichas_tecnicas: [...] } quanto array direto
        const lista = Array.isArray(json) ? json : (json.fichas_tecnicas || json.am3d_saved_fts || []);
        if (!lista.length) return alert('Nenhuma FT encontrada no arquivo.');

        setIsMigrating(true);
        const inserts = lista.map(ft => ({
          id: ft.indiceFt || ft.id,
          name: ft.nomePeca || ft.name || 'Sem Nome',
          cost: ft._custoFinal || ft.cost || 0,
          data: ft.data || ft
        }));
        const { error: insertErr } = await supabase.from('fichas_tecnicas').insert(inserts);
        if (insertErr) { alert('Erro ao importar: ' + insertErr.message); setIsMigrating(false); return; }
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

  const handleSaveFt = async () => {
    if (!inputs.indiceFt.trim()) return alert("O Índice da FT não pode estar vazio.");
    
    const ftData = {
      ...inputs,
      _custoFinal: resultados.custoFisicoUnit
    };

    setSavedFts(prev => {
      const idx = prev.findIndex(item => item.indiceFt === inputs.indiceFt);
      let novaLista = [...prev];

      if (idx >= 0) {
        novaLista[idx] = ftData; // Atualiza se já existir (Edit)
      } else {
        novaLista.push(ftData); // Cria novo caso não exista
      }

      // Automotivamente puxa o próximo ID limpo pra tela E reseta os campos especificados
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
        }));
      }, 100);
      return novaLista;
    });

    // Salva no banco de dados na nuvem
    await supabase.from('fichas_tecnicas').upsert({
       id: ftData.indiceFt,
       name: ftData.nomePeca,
       cost: ftData._custoFinal,
       data: ftData
    });
  };

  const handleEdit = (ft) => {
    const cleanFt = Object.fromEntries(Object.entries(ft).filter(([_, v]) => v !== '' && v !== null && v !== undefined));
    setInputs({ ...INITIAL_STATE, ...cleanFt });
    setActiveTab('single');
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Sobe a tela suavemente
  };

  const handleDelete = async (id) => {
    if(window.confirm(`Tem certeza que deseja excluir ${id}?`)) {
      setSavedFts(prev => {
        const nova = prev.filter(f => f.indiceFt !== id);
        setInputs(c => ({...c, indiceFt: getNextFtId(nova)}));
        return nova;
      });
      await supabase.from('fichas_tecnicas').delete().eq('id', id);
    }
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
    
    // Preenche o formulário com os dados somados
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
        <div className="header-actions">
          {activeTab === 'single' && (
            <button className="btn-primary" onClick={handleSaveFt}>Salvar Ficha Técnica</button>
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
        
        {loadingDb || isMigrating ? (
          <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)'}}>
             <Loader size={40} className="spinner" color="var(--primary)" style={{marginBottom: '1rem'}} />
             <p>{isMigrating ? 'Sincronizando suas Fichas Técnicas para a Nuvem pela primeira vez...' : 'Carregando banco de dados...'}</p>
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


    </div>
  );
}
