import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Loader } from 'lucide-react';

const INITIAL_STATE = {
  id: '',
  name: '',
  price: '',
  description: ''
};

const getNextOrcId = (listaAtual) => {
  if (!listaAtual) return 'ORC-01';
  for (let i = 1; i <= 150; i++) {
     const id = `ORC-${String(i).padStart(2, '0')}`;
     if (!listaAtual.find(item => item.id === id)) {
         return id;
     }
  }
  return 'ORC-151';
};

export default function Orcamentos() {
  const [savedOrcs, setSavedOrcs] = useState([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [inputs, setInputs] = useState({ ...INITIAL_STATE });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchOrcamentos();
  }, []);

  const fetchOrcamentos = async () => {
    setLoadingDb(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const rawResp = await fetch(`${SUPA_URL}/rest/v1/orcamentos_rapidos?select=*&order=id.asc`, {
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
      });
      
      if (rawResp.ok) {
        const data = await rawResp.json();
        setSavedOrcs(data);
        setInputs(prev => ({ ...prev, id: getNextOrcId(data) }));
      }
    } catch (e) {
      console.error("Erro ao buscar orçamentos:", e);
    } finally {
      setLoadingDb(false);
    }
  };

  const handleChange = (e) => {
    let { name, value } = e.target;
    
    if (name === "id") {
      const orcExistente = savedOrcs.find(o => o.id === value);
      if (orcExistente) {
        if (window.confirm(`O orçamento ${value} já possui dados salvos ("${orcExistente.name}"). Deseja carregar os dados para edição?`)) {
          setInputs({
            id: orcExistente.id,
            name: orcExistente.name,
            price: orcExistente.data?.price || '',
            description: orcExistente.data?.description || ''
          });
          return;
        }
      }
    }

    if (name === "price" && typeof value === 'string') {
      value = value.replace(',', '.');
    }

    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!inputs.id.trim()) return alert("O ID não pode estar vazio.");
    if (!inputs.name.trim()) return alert("O Nome não pode estar vazio.");
    
    const dbRecord = {
      id: inputs.id,
      name: inputs.name,
      data: {
        price: inputs.price ? parseFloat(inputs.price) : 0,
        description: inputs.description
      }
    };

    setSavedOrcs(prev => {
      const idx = prev.findIndex(item => item.id === inputs.id);
      let novaLista = [...prev];

      if (idx >= 0) {
        novaLista[idx] = dbRecord;
      } else {
        novaLista.push(dbRecord);
      }

      setTimeout(() => {
        setInputs({
          id: getNextOrcId(novaLista),
          name: '',
          price: '',
          description: ''
        });
      }, 100);
      return novaLista;
    });

    const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const headers = { 
      'apikey': SUPA_KEY, 
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    };
    
    await fetch(`${SUPA_URL}/rest/v1/orcamentos_rapidos`, {
      method: 'POST',
      headers,
      body: JSON.stringify(dbRecord)
    });
  };

  const handleEdit = (orc) => {
    setInputs({
      id: orc.id,
      name: orc.name,
      price: orc.data?.price || '',
      description: orc.data?.description || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if(window.confirm(`Tem certeza que deseja excluir o orçamento ${id}?`)) {
      setSavedOrcs(prev => {
        const nova = prev.filter(o => o.id !== id);
        setInputs(c => ({...c, id: getNextOrcId(nova)}));
        return nova;
      });
      
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      await fetch(`${SUPA_URL}/rest/v1/orcamentos_rapidos?id=eq.${id}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
      });
    }
  };

  const filteredOrcs = savedOrcs.filter(o => {
    const nome = o.name ? String(o.name).toLowerCase() : "";
    const id = o.id ? String(o.id).toLowerCase() : "";
    const search = searchTerm.toLowerCase();
    return nome.includes(search) || id.includes(search);
  });

  return (
    <div className="page-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">Orçamentos Rápidos</h1>
          <p className="page-description">Cadastre itens personalizados ou avulsos que não são Fichas Técnicas (FTs) padrão, para usá-los diretamente nos Pedidos.</p>
        </div>
        <button className="btn-primary" onClick={handleSave}>💾 Salvar Orçamento</button>
      </div>
      
      <div className="card" style={{ marginBottom: '2.5rem' }}>
        <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Novo Orçamento</h3>
        <div className="form-grid-2">
          <div className="form-group">
            <label>ID do Orçamento</label>
            <input 
              name="id" 
              value={inputs.id} 
              onChange={handleChange} 
              placeholder="Ex: ORC-01" 
            />
          </div>
          <div className="form-group">
            <label>Nome do Item / Serviço</label>
            <input 
              name="name" 
              value={inputs.name} 
              onChange={handleChange} 
              placeholder="Ex: Troféu Personalizado Acrílico" 
            />
          </div>
          <div className="form-group">
            <label>Preço de Venda Sugerido (R$)</label>
            <input 
              name="price" 
              type="number"
              step="0.01"
              value={inputs.price} 
              onChange={handleChange} 
              placeholder="Ex: 150.00" 
            />
          </div>
          <div className="form-group">
            <label>Descrição / Observações</label>
            <input 
              name="description" 
              value={inputs.description} 
              onChange={handleChange} 
              placeholder="Ex: Inclui pintura manual dourada" 
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem'}}>
          <h3 style={{color: 'var(--text-primary)', margin: 0}}>
            📋 Orçamentos Salvos
          </h3>
          
          <div className="search-bar" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-primary)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
             <span style={{ marginRight: '0.5rem' }}>🔍</span>
             <input 
               type="text" 
               placeholder="Buscar por nome ou ID..." 
               value={searchTerm} 
               onChange={(e) => setSearchTerm(e.target.value)}
               style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)' }}
             />
          </div>
        </div>
        
        {loadingDb ? (
          <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)'}}>
             <Loader size={40} className="spinner" color="var(--primary)" style={{marginBottom: '1rem'}} />
             <p>Carregando orçamentos...</p>
          </div>
        ) : filteredOrcs.length === 0 ? (
          <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)'}}>
            <p>Nenhum orçamento encontrado.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '1rem' }}>ID</th>
                  <th style={{ padding: '1rem' }}>Nome</th>
                  <th style={{ padding: '1rem' }}>Preço</th>
                  <th style={{ padding: '1rem' }}>Descrição</th>
                  <th style={{ padding: '1rem', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredOrcs].sort((a, b) => a.id.localeCompare(b.id)).map(orc => (
                  <tr key={orc.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ background: '#FEF3C7', color: '#D97706', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.8rem' }}>
                        {orc.id}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', fontWeight: '600', color: 'var(--text-primary)' }}>{orc.name}</td>
                    <td style={{ padding: '1rem', color: 'var(--text-primary)' }}>R$ {orc.data?.price ? parseFloat(orc.data.price).toFixed(2) : '0.00'}</td>
                    <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{orc.data?.description || '—'}</td>
                    <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button onClick={() => handleEdit(orc)} style={{color: 'var(--accent-primary)', fontWeight: 'bold', background: 'none', border: 'none', cursor: 'pointer'}}>✏️ Editar</button>
                      <button onClick={() => handleDelete(orc.id)} style={{color: 'var(--danger)', fontWeight: 'bold', background: 'none', border: 'none', cursor: 'pointer'}}>🗑️</button>
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
