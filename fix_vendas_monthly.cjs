const fs = require('fs');
const path = './src/pages/Vendas.jsx';
let content = fs.readFileSync(path, 'utf8');

// Fix broken function declaration
content = content.replace(
  /\}\n\(\{ month, vendasMensal, savedFts, overrides, channelDefaults, onClose \}\) \{/,
  '}\n\nfunction MonthlyReportOverlay({ month, vendasMensal, savedFts, overrides, channelDefaults, onClose }) {'
);

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed MonthlyReportOverlay');
