const fs = require('fs');
const path = './src/pages/FinancasPessoais.jsx';
let content = fs.readFileSync(path, 'utf8');

// Update Categories
content = content.replace(
  /const CATEGORIAS_SAIDA = \[.*?\];/,
  'const CATEGORIAS_SAIDA = ["Gastos fixos", "Escola", "Carros", "Mercado", "Vestuario", "Lazer"];'
);

// Update default form state category
content = content.replace(
  /categoria: "Contas Fixas"/g,
  'categoria: "Gastos fixos"'
);

content = content.replace(
  /categoria: "Mercado"/g,
  'categoria: "Gastos fixos"'
);

// Update 'Data *' label to 'Vencimento *'
content = content.replace(
  /<label([^>]*)>\s*Data \*\s*<input/g,
  '<label$1> Vencimento * <input'
);

// Update table header
content = content.replace(
  /<th>Data<\/th>/,
  '<th>Vencimento</th>'
);

fs.writeFileSync(path, content, 'utf8');
