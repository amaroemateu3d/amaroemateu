const fs = require('fs');
let code = fs.readFileSync('src/pages/Acertos.jsx', 'utf8');

const regex = /const message = \\*AM3D - COMPROVANTE DE ACERTO CONSIGNADO\*\n\n\ \+[\s\S]*?\Obrigado pela parceria! ??\;/;
const newBlock = \const message = \\\*AM3D - COMPROVANTE DE ACERTO CONSIGNADO*\n\n\\\ +
      \\\?? *Cliente:* \\n\\\ +
      \\\?? *Data:* \\n\n\\\ +
      \\\*Peças Acertadas:*\n\\n\n\\\ +
      \\\*Resumo Financeiro:*\n\\\ +
      (settlement.tipoAcerto === 'comissionado' ? \\\*Venda Bruta:* R$ \\n\\\ : '') +
      \\\\\n\n\\\ +
      \\\Obrigado pela parceria! ??\\\;\;

code = code.replace(regex, newBlock);
fs.writeFileSync('src/pages/Acertos.jsx', code, 'utf8');
