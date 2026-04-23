export const parseTime = (timeStr) => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  return isNaN(h) || isNaN(m) ? 0 : h + (m / 60);
};

export const parseNumber = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  const n = Number(String(val).replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

export const formatTime = (decimalHours) => {
  if (decimalHours === 0) return '00:00';
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const getUnitProductionTime = (ft) => {
  const qtd = Math.max(1, parseNumber(ft.quantidade));
  const totalHours = parseTime(ft.tempoImpressao);
  return totalHours / qtd;
};

// Soma os até 3 gastos extras cadastrados na FT (são por unidade produzida)
export const getCustosExtrasAdicionais = (inp) => {
  return (
    parseNumber(inp.extraValor1) +
    parseNumber(inp.extraValor2) +
    parseNumber(inp.extraValor3)
  );
};

export const getCustoFisicoUnitario = (inp) => {
  const qtd = Math.max(1, parseNumber(inp.quantidade));
  const tImpHoras = parseTime(inp.tempoImpressao);

  const custoMaterial = (parseNumber(inp.pesoGramas) / 1000) * parseNumber(inp.precoKgMaterial);
  const custoEnergia  = tImpHoras * parseNumber(inp.custoKwh);
  const custoMaquina  = tImpHoras * parseNumber(inp.custoDepreciacao);
  const custosExtrasAdic = getCustosExtrasAdicionais(inp);

  return (custoMaterial + custoEnergia + custoMaquina) / qtd + custosExtrasAdic;
};

export const getCustoExtrasUnitario = (inp) => {
  // ATENÇÃO: Embalagens, Fretes e Extras configurados globalmente no E-commerce 
  // são valores por UNIDADE DE VENDA (por SKU), portanto NÃO DEVEM ser divididos
  // pela quantidade (`quantidade`) que representa o lote FíSICO DE PRODUÇÃO na fábrica.
  return (parseNumber(inp.custoEnvio) + parseNumber(inp.custoEmbalagem) + parseNumber(inp.custoExtra));
};

export const getCustoUnitario = (inp) => {
  return getCustoFisicoUnitario(inp) + getCustoExtrasUnitario(inp);
};

export const getResultados = (inp) => {
  const qtd = Math.max(1, parseNumber(inp.quantidade));
  const tImpHoras = parseTime(inp.tempoImpressao);
  const custoMaterial = (parseNumber(inp.pesoGramas) / 1000) * parseNumber(inp.precoKgMaterial);
  const custoEnergia  = tImpHoras * parseNumber(inp.custoKwh);
  const custoMaquina  = tImpHoras * parseNumber(inp.custoDepreciacao);
  const custosExtras  = parseNumber(inp.custoEnvio) + parseNumber(inp.custoEmbalagem) + parseNumber(inp.custoExtra);
  const custosExtrasAdic = getCustosExtrasAdicionais(inp);

  const custoUnitario = getCustoUnitario(inp);
  const custoFisicoUnit = getCustoFisicoUnitario(inp);
  const custoExtrasUnit = getCustoExtrasUnitario(inp);

  const precoManual = parseNumber(inp.precoVendaManual);
  // O usuário DEVE digitar o preço. Se não, é 0.
  const precoSugerido = parseNumber(inp.precoVendaManual) || 0;
  
  // Impostos incidem sobre o preço de venda
  const percImposto = parseNumber(inp.impostosNF) / 100;
  const percPlataforma = parseNumber(inp.taxaMLPerc) / 100;
  
  const aliquotaImpostos = precoSugerido * percImposto;
  const aliquotaMLPerc = precoSugerido * percPlataforma;
  
  // Taxa Plataforma Fixa NUNCA divide por lote, ela é por venda unitária (SKU)
  const taxaPlataformaFixaUnit = parseNumber(inp.taxaFixaVenda);
  const aliquotaMarketplaceTotal = aliquotaMLPerc + taxaPlataformaFixaUnit;

  // Custo TOTAL do E-commerce por Peça Vendida:
  // Custo Físico + Custo Repassado Seco (Embalagem, Frete, Extra) + Taxas Fixas e Variáveis da Venda
  const custoTotalVenda = custoFisicoUnit + custoExtrasUnit + taxaPlataformaFixaUnit + aliquotaImpostos + aliquotaMLPerc;

  // Lucro Real daquela venda
  const lucroLiquido = precoSugerido - custoTotalVenda;
  // Margem Bruta na venda
  const margemContribuicaoPerc = precoSugerido > 0 ? (lucroLiquido / precoSugerido) * 100 : 0;
  // Apenas para efeito visual de conferência interna
  const lucroBruto = precoSugerido - (custoFisicoUnit + custoExtrasUnit);

  // DRE Breakdowns (A pedido do usuário)
  const despesasProducao = custoFisicoUnit + parseNumber(inp.custoEmbalagem) + parseNumber(inp.custoExtra);
  const despesasVenda = parseNumber(inp.custoEnvio) + taxaPlataformaFixaUnit + aliquotaImpostos + aliquotaMLPerc;

  return {
    custoFisicoUnit,
    custosExtrasAdic,                // gastos extras por unidade
    custoMaterialUnit: custoMaterial / qtd, 
    custoEnergiaUnit: custoEnergia / qtd, 
    custoMaquinaUnit: custoMaquina / qtd, 
    custosExtras: custoExtrasUnit,
    custoUnitario: custoTotalVenda,
    precoSugerido, 
    lucroBruto, 
    lucroLiquido, 
    aliquotaImpostos,
    aliquotaMarketplaceTotal, 
    margemContribuicaoPerc,
    despesasProducao,
    despesasVenda
  };
};
