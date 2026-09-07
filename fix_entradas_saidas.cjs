const fs = require('fs');
const path = './src/pages/FinancasPessoais.jsx';
let content = fs.readFileSync(path, 'utf8');

// The messed up part starts around `function Entradas() {` and ends before `function Emprestimos`.
// Let's replace the `handleSave` in Entradas.

// Localize Entradas body
const entradasRegex = /function Entradas\(\) \{([\s\S]*?)function Saidas\(\) \{/;
let entradasBody = content.match(entradasRegex)[1];

// Localize the bad handleSave inside Entradas
const badEntradasHandleSaveRegex = /const handleSave = async \(\) => \{([\s\S]*?)load\(\);\s*\n\s*\}\s*catch \([^)]+\) \{\s*console.error\([^)]+\);\s*alert\([^)]+\);\s*\}\s*\};/;

const correctEntradasHandleSave = `const handleSave = async () => {
    if (!form.descricao) return alert("A descrição é obrigatória.");
    if (!form.data) return alert("A data é obrigatória.");
    await supabase.from("pessoal_entradas").insert([{ ...form, valor: parseN(form.valor) }]);
    setForm({ descricao: "", valor: "", data: today(), categoria: "Salario", observacao: "" });
    setShowModal(false);
    load();
  };`;

if (badEntradasHandleSaveRegex.test(entradasBody)) {
  entradasBody = entradasBody.replace(badEntradasHandleSaveRegex, correctEntradasHandleSave);
} else {
  // If the regex above failed because it didn't match the exact structure, let's just do a greedy replace up to load();
  const fallbackRegex = /const handleSave = async \(\) => \{[\s\S]*?load\(\);[\s\S]*?\};/;
  entradasBody = entradasBody.replace(fallbackRegex, correctEntradasHandleSave);
}

content = content.replace(entradasRegex, `function Entradas() {${entradasBody}function Saidas() {`);

// Now fix Saidas
const saidasRegex = /function Saidas\(\) \{([\s\S]*?)function ParcelasModal/;
let saidasBody = content.match(saidasRegex)[1];

const oldSaidasHandleSaveRegex = /const handleSave = async \(\) => \{[\s\S]*?load\(\);\s*\};/;

const correctSaidasHandleSave = `const handleSave = async () => {
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
  };`;

saidasBody = saidasBody.replace(oldSaidasHandleSaveRegex, correctSaidasHandleSave);

content = content.replace(saidasRegex, `function Saidas() {${saidasBody}function ParcelasModal`);

fs.writeFileSync(path, content, 'utf8');
console.log("Patch applied!");
