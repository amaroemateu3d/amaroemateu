const fs = require('fs');
const path = './src/pages/FinancasPessoais.jsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /const handleSave = async \(\) => \{([\s\S]*?)load\(\);\s*\};/;

const newHandleSave = `const handleSave = async () => {
    try {
      if (!form.descricao) return alert("A descrição é obrigatória.");
      if (!form.data) return alert("A data de vencimento é obrigatória.");
      
      const val = parseN(form.valor);
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
  };`;

content = content.replace(regex, newHandleSave);
fs.writeFileSync(path, content, 'utf8');
