const fs = require('fs');
const path = './src/pages/FichasTecnicas.jsx';
let content = fs.readFileSync(path, 'utf8');

// Add filamentos state
content = content.replace(
  /const \[insumos, setInsumos\] = useState\(\[\]\);/,
  `const [insumos, setInsumos] = useState([]);
  const [filamentos, setFilamentos] = useState([]);
  const [showFilamentosManager, setShowFilamentosManager] = useState(false);
  const [newFilamento, setNewFilamento] = useState({ nome: '', preco_kg: '' });
  const [isUpdatingFts, setIsUpdatingFts] = useState(false);`
);

// Add fetchFilamentos call in useEffect
content = content.replace(
  /fetchInsumos\(\);/,
  `fetchInsumos();
    fetchFilamentos();`
);

// Add realtime channel for filamentos
content = content.replace(
  /const channelInsumos = supabase/,
  `const channelFilamentos = supabase
      .channel('realtime-filamentos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'filamentos' },
        () => {
          fetchFilamentos();
        }
      )
      .subscribe();

    const channelInsumos = supabase`
);

// Add removeChannel for filamentos
content = content.replace(
  /supabase\.removeChannel\(channelInsumos\);/,
  `supabase.removeChannel(channelInsumos);
      supabase.removeChannel(channelFilamentos);`
);

// Add fetchFilamentos function
const fetchInsumosFunc = `const fetchInsumos = async () => {`;
const fetchFilamentosFunc = `const fetchFilamentos = async () => {
    try {
      const { data, error } = await supabase.from('filamentos').select('*').order('nome', { ascending: true });
      if (!error && data) setFilamentos(data);
    } catch (e) {
      console.error("Erro ao buscar filamentos:", e);
    }
  };

  const handleAddFilamento = async (e) => {
    e.preventDefault();
    if (!newFilamento.nome.trim() || !newFilamento.preco_kg) return;
    try {
      const empId = profile?.empresa_id;
      const { error } = await supabase.from('filamentos').insert({
        nome: newFilamento.nome,
        preco_kg: parseFloat(newFilamento.preco_kg),
        empresa_id: empId
      });
      if (error) throw error;
      setNewFilamento({ nome: '', preco_kg: '' });
      fetchFilamentos();
    } catch (e) {
      alert("Erro ao adicionar: " + e.message);
    }
  };

  const handleDeleteFilamento = async (id) => {
    if (!window.confirm("Atenção: Excluir este filamento não apagará as Fichas Técnicas que o utilizam, mas elas deixarão de receber atualizações de preço deste filamento. Deseja continuar?")) return;
    try {
      await supabase.from('filamentos').delete().eq('id', id);
      fetchFilamentos();
    } catch (e) {
      alert("Erro ao excluir: " + e.message);
    }
  };

  const handleUpdateFilamentoCost = async (fil, newCostStr) => {
    const novoCusto = parseFloat(newCostStr);
    if (!novoCusto || novoCusto === fil.preco_kg) return;
    if (!window.confirm(\`Deseja alterar o custo do \${fil.nome} para R$ \${novoCusto.toFixed(2)}? ISSO ATUALIZARÁ AUTOMATICAMENTE TODAS AS FICHAS TÉCNICAS QUE USAM ESTE FILAMENTO.\`)) return;
    
    setIsUpdatingFts(true);
    try {
      // 1. Atualizar o filamento
      await supabase.from('filamentos').update({ preco_kg: novoCusto }).eq('id', fil.id);
      
      // 2. Buscar FTs que usam este filamento
      const { data: ftsParaAtualizar } = await supabase.from('fichas_tecnicas').select('*');
      const ftsAlvo = (ftsParaAtualizar || []).filter(f => f.data?.filamento_id === fil.id);
      
      if (ftsAlvo.length > 0) {
        // 3. Recalcular cada FT
        const atualizados = ftsAlvo.map(ftRow => {
          const dadosAntigos = ftRow.data;
          const novosDados = { ...dadosAntigos, precoKgMaterial: novoCusto };
          // Usa a lógica de calcularResultados (já temos getResultados importado)
          const resultados = getResultados(novosDados);
          novosDados._custoFinal = resultados.custoFisicoUnit;
          
          return {
            id: ftRow.id,
            name: ftRow.name,
            cost: resultados.custoFisicoUnit,
            data: novosDados,
            empresa_id: ftRow.empresa_id,
            estoque: ftRow.estoque
          };
        });
        
        // 4. Salvar tudo em lote
        await supabase.from('fichas_tecnicas').upsert(atualizados, { onConflict: 'id,empresa_id' });
        alert(\`✅ \${atualizados.length} Fichas Técnicas atualizadas com o novo custo!\`);
      } else {
        alert("Custo atualizado, mas nenhuma Ficha Técnica usava este filamento.");
      }
      
      fetchFilamentos();
    } catch (e) {
      alert("Erro ao atualizar custo em lote: " + e.message);
    } finally {
      setIsUpdatingFts(false);
    }
  };

  `;
content = content.replace(fetchInsumosFunc, fetchFilamentosFunc + fetchInsumosFunc);

fs.writeFileSync(path, content, 'utf8');
console.log('State and logic patched');
