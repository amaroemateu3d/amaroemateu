const fs = require('fs');
const path = './src/pages/FinancasPessoais.jsx';
let content = fs.readFileSync(path, 'utf8');

const oldLine = 'const grupo_id = recorrente ? crypto.randomUUID() : null;';
const newLine = `
    const generateUUID = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };
    const grupo_id = recorrente ? generateUUID() : null;
`;

content = content.replace(oldLine, newLine);
fs.writeFileSync(path, content, 'utf8');
