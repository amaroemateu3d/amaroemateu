const fs = require('fs');
const path = './src/pages/FinancasPessoais.jsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'const CATEGORIAS_SAIDA = ["Gastos fixos", "Escola", "Carros", "Mercado", "Vestuario", "Lazer"];',
  'const CATEGORIAS_SAIDA = ["Gastos fixos", "Escola", "Carros", "Mercado", "Vestuario", "Lazer", "Variados"];'
);

fs.writeFileSync(path, content, 'utf8');
