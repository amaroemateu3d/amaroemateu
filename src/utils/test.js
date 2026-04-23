import { getResultados } from './financeCalculators.js';

const inp = {
  quantidade: 1,
  tempoImpressao: "01:00",
  pesoGramas: 100,
  precoKgMaterial: 100, // 10 reais
  custoKwh: 1,          // 1 real
  custoDepreciacao: 1,  // 1 real
  custoEmbalagem: "100", // The global rule
  custoEnvio: 0,
  custoExtra: 0,
  markup: 3, 
  // no precoVendaManual
};

console.log(getResultados(inp));
