const fs = require('fs');
const path = './src/pages/FinancasPessoais.jsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'const baseDate = new Date(form.data_contratacao);',
  'const baseDate = new Date(form.data_contratacao + "T12:00:00");'
);

fs.writeFileSync(path, content, 'utf8');
