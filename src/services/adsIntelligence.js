import { getResultados, parseNumber } from '../utils/financeCalculators';
import { mlProxyFetch, getValidMlToken } from './mercadolivre';
import {
  shopeeProxyFetch,
  getValidShopeeToken,
  syncListingsFromShopee,
} from './shopee';

const STORAGE_RULES_KEY = 'am3d_ads_ia_rules_v2';
const STORAGE_ADS_METRICS_KEY = 'am3d_ads_manual_metrics_v1';
const STORAGE_RAMP_STATE_KEY = 'am3d_ads_ramp_state_v1';

export const DEFAULT_ADS_IA_RULES = {
  margemMinimaPerc: 25,
  margemReaquecimentoPerc: 20,
  margemRankeamentoPerc: 15,
  rampaDiaPerc: 1,
  maxDescontoCadastroPerc: 25,
  acosAlvoPerc: 8,
  orcamentoDiarioMaxMl: 15,
  orcamentoDiarioMaxShopee: 15,
  estoqueAltoGiroMin: 12,
  estoqueBaixoProtecaoMax: 3,
  regrasPersonalizadas:
    'Margem saudável alvo 25%. Itens sem vendas ou 30+ dias parados vão para 15% (rankeamento). Após destravar venda, subir +1% ao dia até 25%. 15+ dias sem venda vai para 20%.',
  geminiApiKey: '',
};

export function loadRampState() {
  try {
    const raw = localStorage.getItem(STORAGE_RAMP_STATE_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch {
    // ignore
  }
  return {};
}

export function saveRampState(stateMap) {
  try {
    localStorage.setItem(STORAGE_RAMP_STATE_KEY, JSON.stringify(stateMap));
  } catch {
    // ignore
  }
}

/**
 * Calcula a Margem Alvo Dinâmica de acordo com o ciclo de vida do anúncio:
 * - Sem vendas ou 30+ dias sem vender -> 15% (Rankeamento)
 * - 15 a 29 dias sem vender -> 20% (Reaquecimento)
 * - Em escalada pós-venda (+1%/dia) -> sobe 1% por dia de 15% até 25%
 * - Vendendo normalmente -> 25% (Saudável)
 */
export function resolveDynamicTargetMargin(
  { vendasMes = 0, soldQuantityTotal = null, daysSinceLastSale = null, rampStartDate = null },
  rules
) {
  const healthy = parseNumber(rules.margemMinimaPerc || 25);
  const warm = parseNumber(rules.margemReaquecimentoPerc || 20);
  const rank = parseNumber(rules.margemRankeamentoPerc || 15);
  const step = Math.max(0.5, parseNumber(rules.rampaDiaPerc || 1));

  // 1. Mais de 30 dias sem venda -> volta para 15% (Re-rankear)
  if (daysSinceLastSale !== null && daysSinceLastSale >= 30) {
    return {
      phase: 'rerank_30d',
      badge: `🔄 Re-rankear (${daysSinceLastSale}d s/ venda)`,
      targetPerc: rank,
      color: '#DC2626',
    };
  }

  // 2. 15 a 29 dias sem venda -> 20% (Reaquecimento)
  if (daysSinceLastSale !== null && daysSinceLastSale >= 15) {
    return {
      phase: 'warm_15d',
      badge: `⚠️ Reaquecer (${daysSinceLastSale}d s/ venda)`,
      targetPerc: warm,
      color: '#D97706',
    };
  }

  // 3. Em escalada gradual (+1% por dia após destravar venda)
  if (rampStartDate) {
    const startMs = new Date(rampStartDate).getTime();
    if (!Number.isNaN(startMs)) {
      const daysElapsed = Math.max(0, Math.floor((Date.now() - startMs) / (1000 * 60 * 60 * 24)));
      const ramped = Math.min(healthy, rank + daysElapsed * step);
      if (ramped < healthy) {
        return {
          phase: 'ramping',
          badge: `📈 Escalada +${step}%/dia (Dia ${daysElapsed + 1})`,
          targetPerc: ramped,
          color: '#2563EB',
        };
      }
    }
  }

  // 4. Sem nenhuma venda ainda (nem no mês nem histórico conhecido) -> Rankeamento (15%)
  const neverSold =
    vendasMes === 0 &&
    (soldQuantityTotal === 0 || (soldQuantityTotal === null && daysSinceLastSale === null));
  if (neverSold) {
    return {
      phase: 'rank_new',
      badge: '🚀 Rankeamento (0 vendas)',
      targetPerc: rank,
      color: '#7C3AED',
    };
  }

  // 5. Vendendo normalmente -> Margem Saudável (25%)
  return {
    phase: 'healthy',
    badge:
      daysSinceLastSale !== null
        ? `🟢 Saudável (vendeu há ${daysSinceLastSale}d)`
        : '🟢 Margem Saudável',
    targetPerc: healthy,
    color: '#059669',
  };
}

export function loadAdsIaRules() {
  try {
    const raw = localStorage.getItem(STORAGE_RULES_KEY);
    if (raw) {
      return { ...DEFAULT_ADS_IA_RULES, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_ADS_IA_RULES };
}

export function saveAdsIaRules(rules) {
  try {
    localStorage.setItem(STORAGE_RULES_KEY, JSON.stringify(rules));
  } catch {
    // ignore
  }
}

export function loadManualAdsMetrics() {
  try {
    const raw = localStorage.getItem(STORAGE_ADS_METRICS_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch {
    // ignore
  }
  return {};
}

export function saveManualAdsMetrics(metricsMap) {
  try {
    localStorage.setItem(STORAGE_ADS_METRICS_KEY, JSON.stringify(metricsMap));
  } catch {
    // ignore
  }
}

/**
 * Calcula o Escudo de Margem (Preço Piso, Preço de Queima, Margem Líquida Pós-Ads e Desconto Máximo)
 * para uma FT em um canal específico.
 */
export function calculateAdShieldMetrics(effectiveFt, rules, itemAdsMetrics = {}) {
  const res = getResultados(effectiveFt);

  const custoFixoUnit =
    res.custoFisicoUnit +
    res.custosExtras +
    parseNumber(effectiveFt.taxaFixaVenda);

  const aliquotaCanalPerc =
    parseNumber(effectiveFt.impostosNF) +
    parseNumber(effectiveFt.taxaMLPerc) +
    parseNumber(effectiveFt.custoEnvioPerc);

  const precoBaseVenda =
    parseNumber(effectiveFt.precoVendaSistema) > 0
      ? parseNumber(effectiveFt.precoVendaSistema)
      : parseNumber(effectiveFt.precoVendaManual);
  const precoCadastro =
    parseNumber(effectiveFt.precoAnuncio) > 0
      ? parseNumber(effectiveFt.precoAnuncio)
      : precoBaseVenda > 0
      ? precoBaseVenda / 0.7
      : 0;
  const precoPraticado =
    parseNumber(effectiveFt.precoRealAtivo) > 0
      ? parseNumber(effectiveFt.precoRealAtivo)
      : precoBaseVenda;

  // Métricas de Ads informadas ou puxadas da API
  const gastoAdsMes = parseNumber(itemAdsMetrics.gastoAds);
  const vendasMes = Math.max(0, Number(itemAdsMetrics.vendasMes || 0));
  const faturamentoMes = precoPraticado * vendasMes;

  const gastoAdsUnit = vendasMes > 0 && gastoAdsMes > 0 ? gastoAdsMes / vendasMes : 0;
  const acosRealPerc =
    faturamentoMes > 0 && gastoAdsMes > 0
      ? (gastoAdsMes / faturamentoMes) * 100
      : parseNumber(itemAdsMetrics.acosPerc || 0);

  const margemMinima = Math.max(0, parseNumber(rules.margemMinimaPerc));
  // Se há vendas no mês e gasto em R$, embutimos o custo fixo de Ads por unidade no numerador
  // (assim o Preço Piso fica 100% ESTÁVEL e nunca muda quando alteramos o preço de venda!)
  const custoFixoComAds = custoFixoUnit + gastoAdsUnit;
  const acosParaPiso = gastoAdsUnit > 0 ? 0 : acosRealPerc > 0 ? acosRealPerc : 0;

  // Denominador para Preço de Queima (Margem 0%)
  const denomQueima = 1 - (aliquotaCanalPerc + acosParaPiso) / 100;
  const precoQueima = denomQueima > 0.05 ? custoFixoComAds / denomQueima : custoFixoComAds * 2;

  // Denominador para Preço Piso (garantindo margemMinima% líquida após todos os custos + Ads)
  const denomPiso = 1 - (aliquotaCanalPerc + acosParaPiso + margemMinima) / 100;
  const precoPiso = denomPiso > 0.05 ? custoFixoComAds / denomPiso : precoQueima * 1.25;

  // Lucro e margem reais considerando o preço praticado hoje e o gasto de Ads
  const custoVariavelHoje =
    gastoAdsUnit > 0
      ? precoPraticado * (aliquotaCanalPerc / 100) + gastoAdsUnit
      : precoPraticado * ((aliquotaCanalPerc + acosRealPerc) / 100);
  const lucroLiquidoPosAds =
    precoPraticado > 0 ? precoPraticado - custoFixoUnit - custoVariavelHoje : 0;
  const margemPosAdsPerc =
    precoPraticado > 0 ? (lucroLiquidoPosAds / precoPraticado) * 100 : 0;

  // Desconto máximo que ainda pode ser aplicado sobre o preço atual e sobre o preço de cadastro sem furar o Preço Piso
  const descMaxSobrePraticadoPerc =
    precoPraticado > precoPiso
      ? Math.min(
          parseNumber(rules.maxDescontoCadastroPerc || 30),
          ((precoPraticado - precoPiso) / precoPraticado) * 100
        )
      : 0;

  const descMaxSobreCadastroPerc =
    precoCadastro > precoPiso
      ? Math.min(
          45,
          ((precoCadastro - precoPiso) / precoCadastro) * 100
        )
      : 0;

  return {
    custoFixoUnit,
    aliquotaCanalPerc,
    precoCadastro,
    precoBaseVenda,
    precoPraticado,
    precoQueima,
    precoPiso,
    gastoAdsMes,
    acosRealPerc,
    lucroLiquidoSemAds: res.lucroLiquido,
    margemSemAdsPerc: res.margemContribuicaoPerc,
    lucroLiquidoPosAds,
    margemPosAdsPerc,
    descMaxSobrePraticadoPerc,
    descMaxSobreCadastroPerc,
  };
}

/**
 * Avalia um item e gera o diagnóstico + recomendação acionável do Agente Copiloto.
 */
export function evaluateAiRecommendation(item, rules) {
  const {
    metrics,
    estoqueTotal,
    vendasMes,
    soldQuantityTotal,
    competitor,
    promoInfo,
    dynamicMargin,
  } = item;

  const {
    precoPraticado,
    precoPiso,
    margemPosAdsPerc,
    gastoAdsMes,
    acosRealPerc,
    descMaxSobrePraticadoPerc,
  } = metrics;

  const minMargin = parseNumber(rules.margemMinimaPerc);
  const acosLimit = parseNumber(rules.acosAlvoPerc || 10);

  // Identifica se há convite de promoção/campanha do ML vantajoso (que respeita o Preço Piso)
  const candidatePromos = Array.isArray(promoInfo?.candidatePromos) ? promoInfo.candidatePromos : [];
  const activePromos = Array.isArray(promoInfo?.activePromos) ? promoInfo.activePromos : [];
  const goodCampaignInvite = candidatePromos.find((p) => {
    if (p.type === 'PRICE_DISCOUNT') return false; // avaliado separadamente se estiver sem promo
    const refPrice = p.maxDiscountedPrice > 0 ? p.maxDiscountedPrice : p.suggestedPrice;
    // Se tiver co-participação do ML (meliPercentage), o vendedor recebe um desconto subsidiado
    return refPrice <= 0 || refPrice >= precoPiso - 0.05;
  });

  // 1. Sem preço configurado
  if (precoPraticado <= 0) {
    const precoSugerido = precoPiso * 1.15;
    return {
      severity: 'atencao',
      badge: '⚪ Sem Preço',
      title: 'Definir preço inicial seguro',
      explanation: `Seu Preço Piso para garantir ${minMargin}% de margem líquida é R$ ${precoPiso.toFixed(2)}. Sugerimos iniciar em R$ ${precoSugerido.toFixed(2)}.`,
      suggestedPrice: Number(precoSugerido.toFixed(2)),
      actionLabel: `Aplicar R$ ${precoSugerido.toFixed(2)}`,
    };
  }

  // 2. Corta-Sangria: Ads gastando sem vendas
  if (gastoAdsMes >= Math.max(8, metrics.lucroLiquidoSemAds) && vendasMes === 0) {
    return {
      severity: 'critico',
      badge: '🔴 Corta-Sangria Ads',
      title: 'Pausar Ads deste anúncio imediatamente',
      explanation: `Este item já consumiu R$ ${gastoAdsMes.toFixed(2)} em cliques com 0 vendas no mês. Pause o Ads para estancar o prejuízo e use desconto direto no preço (até R$ ${precoPiso.toFixed(2)}).`,
      suggestedPrice: Number(Math.max(precoPiso, precoPraticado * 0.92).toFixed(2)),
      actionLabel: `Ajustar p/ R$ ${Math.max(precoPiso, precoPraticado * 0.92).toFixed(2)}`,
    };
  }

  // 3. Abaixo do Preço Piso (Margem líquida menor que a mínima exigida)
  if (precoPraticado < precoPiso - 0.05 || margemPosAdsPerc < minMargin - 0.2) {
    return {
      severity: 'critico',
      badge: '🔴 Abaixo do Piso',
      title: `Subir preço para proteger sua margem de ${minMargin}%`,
      explanation: `Hoje está sobrando ${margemPosAdsPerc.toFixed(1)}% de margem líquida${acosRealPerc > 0 ? ` (ACOS de ${acosRealPerc.toFixed(1)}%)` : ''}, abaixo da sua trava mínima de ${minMargin}%. Suba para pelo menos R$ ${precoPiso.toFixed(2)}.`,
      suggestedPrice: Number(precoPiso.toFixed(2)),
      actionLabel: `Corrigir p/ Piso R$ ${precoPiso.toFixed(2)}`,
    };
  }

  // 3.5. Anúncio rodando no Preço de Cadastro cheio no ML (Sem promoção de 30% OFF ativa!)
  if (
    promoInfo &&
    activePromos.length === 0 &&
    (promoInfo.promoPerc || 0) < 1 &&
    metrics.precoBaseVenda > 0 &&
    precoPraticado > metrics.precoBaseVenda + 0.5
  ) {
    const targetDeal = Number(Math.max(precoPiso, metrics.precoBaseVenda).toFixed(2));
    const bestCandidate =
      candidatePromos.find((p) => p.type === 'PRICE_DISCOUNT') ||
      goodCampaignInvite ||
      null;
    return {
      severity: 'atencao',
      badge: '🏷️ Sem Promo Ativa no ML',
      title: `Rodando no Preço de Cadastro (R$ ${precoPraticado.toFixed(2)}) sem os 30% OFF`,
      explanation: `No Mercado Livre este item está com o Preço de Cadastro cheio (R$ ${precoPraticado.toFixed(2)}) e sem promoção ativa. Ative a promoção para cair no Preço de Venda de R$ ${targetDeal.toFixed(2)} (-30% OFF)!`,
      suggestedPrice: targetDeal,
      actionLabel: `Ativar 30% OFF (R$ ${targetDeal.toFixed(2)})`,
      recommendedPromo: bestCandidate,
    };
  }

  // 4. Se houver análise de concorrente carregada, cruza com o Preço Piso
  if (competitor) {
    const refCompPrice =
      competitor.priceToWin > 0
        ? competitor.priceToWin
        : competitor.minPrice > 0
        ? competitor.minPrice
        : competitor.avgPrice;

    if (refCompPrice > 0) {
      if (refCompPrice < precoPiso) {
        return {
          severity: 'atencao',
          badge: '🛑 Escudo Concorrência',
          title: 'Concorrente abaixo do seu Piso — Não baixe o preço!',
          explanation: `A concorrência está em R$ ${refCompPrice.toFixed(2)}, abaixo do seu Preço Piso (R$ ${precoPiso.toFixed(2)}). Não entre em guerra de preço unitário: mantenha acima do piso e crie anúncio em Kit (2x ou 3x) para diluir a taxa fixa!`,
          suggestedPrice: null,
          actionLabel: null,
        };
      }

      if (precoPraticado > refCompPrice + 0.5 && refCompPrice >= precoPiso) {
        const ataquePrice = Math.max(precoPiso, refCompPrice - 0.1);
        const descPerc = ((precoPraticado - ataquePrice) / precoPraticado) * 100;
        return {
          severity: 'oportunidade',
          badge: '🎯 Bater Concorrente',
          title: `Dar ${descPerc.toFixed(0)}% OFF (R$ ${ataquePrice.toFixed(2)}) para liderar`,
          explanation: `O preço de referência dos concorrentes é R$ ${refCompPrice.toFixed(2)} e seu Preço Piso é R$ ${precoPiso.toFixed(2)}. Baixando para R$ ${ataquePrice.toFixed(2)}, você vence a concorrência mantendo lucro acima do mínimo!`,
          suggestedPrice: Number(ataquePrice.toFixed(2)),
          actionLabel: `Aplicar Ataque R$ ${ataquePrice.toFixed(2)}`,
        };
      }

      if (competitor.minPrice > 0 && precoPraticado < competitor.minPrice * 0.88) {
        const novoPreco = Number((competitor.minPrice - 0.5).toFixed(2));
        const ganhoExtra = novoPreco - precoPraticado;
        return {
          severity: 'oportunidade',
          badge: '💰 Subir Lucro',
          title: `Você está barato demais! Suba para R$ ${novoPreco.toFixed(2)}`,
          explanation: `O concorrente mais barato vende a R$ ${competitor.minPrice.toFixed(2)} e o seu está R$ ${precoPraticado.toFixed(2)}. Subindo para R$ ${novoPreco.toFixed(2)}, você continua sendo o mais barato e ganha +R$ ${ganhoExtra.toFixed(2)} de lucro puro por peça!`,
          suggestedPrice: novoPreco,
          actionLabel: `Subir p/ R$ ${novoPreco.toFixed(2)}`,
        };
      }
    }
  }

  // 5. Estoque acabando (Proteger margem cheia)
  if (estoqueTotal > 0 && estoqueTotal <= parseNumber(rules.estoqueBaixoProtecaoMax || 3) && vendasMes > 0) {
    const precoCheio = Math.max(precoPraticado, Number((precoPiso * 1.22).toFixed(2)));
    return {
      severity: 'atencao',
      badge: '🔥 Fim de Estoque',
      title: `Apenas ${estoqueTotal} un. em estoque — Evite dar desconto`,
      explanation: `Restam só ${estoqueTotal} unidade(s) prontas. Não queime margem em promoção ou Ads neste item agora; venda as últimas unidades com margem cheia enquanto produz mais.`,
      suggestedPrice: precoCheio > precoPraticado + 0.5 ? precoCheio : null,
      actionLabel: precoCheio > precoPraticado + 0.5 ? `Subir p/ R$ ${precoCheio.toFixed(2)}` : null,
    };
  }

  // 5.5. Item em Fase de Re-rankeamento (30+ dias sem venda) ou Rankeamento Inicial (0 vendas) -> Trabalhar na Margem de 15%
  if (
    (dynamicMargin?.phase === 'rerank_30d' || dynamicMargin?.phase === 'rank_new') &&
    estoqueTotal >= 2 &&
    precoPraticado > precoPiso + 0.35
  ) {
    const precoRank15 = Number(precoPiso.toFixed(2));
    return {
      severity: 'oportunidade',
      badge: dynamicMargin.phase === 'rerank_30d' ? '🔄 Re-rankear (15% Margem)' : '🚀 Rankear (15% Margem)',
      title:
        dynamicMargin.phase === 'rerank_30d'
          ? `Mais de 30 dias sem venda — Ativar Preço de Rankeamento (15% Margem: R$ ${precoRank15.toFixed(2)})`
          : `Sem vendas — Ativar Preço de Rankeamento (15% Margem: R$ ${precoRank15.toFixed(2)})`,
      explanation: `Como este item está na fase "${dynamicMargin.badge}", sua trava de margem desceu para ${minMargin}% (Preço Piso R$ ${precoRank15.toFixed(2)}). Clique para ativar a promoção a R$ ${precoRank15.toFixed(2)} até destravar vendas e depois ligue a escada +1%/dia!`,
      suggestedPrice: precoRank15,
      actionLabel: `Rankear 15% (R$ ${precoRank15.toFixed(2)})`,
    };
  }

  // 5.6. Item em Fase de Reaquecimento (15 a 29 dias sem venda) -> Trabalhar na Margem de 20%
  if (
    dynamicMargin?.phase === 'reheat_15d' &&
    estoqueTotal >= 2 &&
    precoPraticado > precoPiso + 0.35
  ) {
    const precoReheat20 = Number(precoPiso.toFixed(2));
    return {
      severity: 'oportunidade',
      badge: '⏳ Reaquecer (20% Margem)',
      title: `15+ dias sem venda — Baixar promo para Margem de 20% (R$ ${precoReheat20.toFixed(2)})`,
      explanation: `Este item está há mais de 15 dias sem venda. Reduzir temporariamente a promoção para R$ ${precoReheat20.toFixed(2)} (garantindo ${minMargin}% de margem líquida) ajuda a retomar o giro antes de cair nos 30 dias.`,
      suggestedPrice: precoReheat20,
      actionLabel: `Reaquecer 20% (R$ ${precoReheat20.toFixed(2)})`,
    };
  }

  // 6. Estoque Alto Parado -> Girar Estoque com Promoção
  if (
    estoqueTotal >= parseNumber(rules.estoqueAltoGiroMin || 12) &&
    vendasMes <= 2 &&
    descMaxSobrePraticadoPerc >= 5
  ) {
    const descSugerido = Math.min(12, Math.floor(descMaxSobrePraticadoPerc));
    const precoPromo = Math.max(precoPiso, Number((precoPraticado * (1 - descSugerido / 100)).toFixed(2)));
    return {
      severity: 'oportunidade',
      badge: '📦 Girar Estoque',
      title: `${estoqueTotal} un. paradas — Aplicar ${descSugerido}% OFF na Promoção`,
      explanation: `Você tem ${estoqueTotal} unidades prontas e margem de ${margemPosAdsPerc.toFixed(1)}%. Aplicando ${descSugerido}% de desconto (R$ ${precoPromo.toFixed(2)}), você ativa o selo de oferta e ainda preserva margem acima de ${minMargin}%.`,
      suggestedPrice: precoPromo,
      actionLabel: `Ativar Promo R$ ${precoPromo.toFixed(2)}`,
    };
  }

  // 7. Anúncio novo (< 10 vendas totais) -> Estratégia de Rankeamento
  if (
    soldQuantityTotal !== null &&
    soldQuantityTotal < 10 &&
    estoqueTotal >= 3 &&
    descMaxSobrePraticadoPerc >= 5
  ) {
    const precoRank = Number((precoPiso * 1.03).toFixed(2));
    if (precoRank < precoPraticado - 0.5) {
      return {
        severity: 'oportunidade',
        badge: '🚀 Rankear (Top 10)',
        title: `Destravar primeiras 10 vendas com Preço de Rankeamento`,
        explanation: `Este anúncio tem ${soldQuantityTotal} venda(s) acumuladas. Reduzir temporariamente para R$ ${precoRank.toFixed(2)} (acima do Piso de R$ ${precoPiso.toFixed(2)}) acelera as 10 primeiras vendas que ativam o algoritmo.`,
        suggestedPrice: precoRank,
        actionLabel: `Rankear a R$ ${precoRank.toFixed(2)}`,
      };
    }
  }

  // 8. Convite de Campanha/Promoção do ML que respeita o Preço Piso
  if (goodCampaignInvite && estoqueTotal >= 3) {
    const rawCampPrice =
      goodCampaignInvite.suggestedPrice > 0
        ? goodCampaignInvite.suggestedPrice
        : goodCampaignInvite.maxDiscountedPrice > 0
        ? goodCampaignInvite.maxDiscountedPrice
        : precoPraticado;
    const safeCampPrice = Number(Math.max(precoPiso, rawCampPrice).toFixed(2));
    return {
      severity: 'oportunidade',
      badge: `✨ Convite ML: ${goodCampaignInvite.label}`,
      title: `Oportunidade de entrar na campanha "${goodCampaignInvite.label}" a R$ ${safeCampPrice.toFixed(2)}`,
      explanation: `O Mercado Livre liberou convite para "${goodCampaignInvite.label}"${goodCampaignInvite.meliPercentage > 0 ? ` (com ${goodCampaignInvite.meliPercentage}% pago pelo ML!)` : ''} e o preço exigido respeita seu Preço Piso (R$ ${precoPiso.toFixed(2)}). Vale ativar para ganhar selo e destaque!`,
      suggestedPrice: safeCampPrice,
      actionLabel: `Ativar ${goodCampaignInvite.label} (R$ ${safeCampPrice.toFixed(2)})`,
      recommendedPromo: goodCampaignInvite,
    };
  }

  // 9. Anúncio rodando no preço cheio sem selo de desconto ativo, mas com promo individual liberada
  const priceDiscountCandidate = candidatePromos.find((p) => p.type === 'PRICE_DISCOUNT');
  if (
    activePromos.length === 0 &&
    (promoInfo?.promoPerc || 0) < 1 &&
    priceDiscountCandidate &&
    estoqueTotal >= 3 &&
    precoPraticado >= precoPiso
  ) {
    const targetDeal = Number(Math.max(precoPiso, precoPraticado).toFixed(2));
    return {
      severity: 'oportunidade',
      badge: '🏷️ Ativar Selo % OFF',
      title: 'Anúncio sem promoção ativa — Ativar Desconto Individual',
      explanation: `Este item está sem faixa de desconto riscado no ML, mas possui Desconto Individual liberado na Central de Promoções. Ative o preço de venda (R$ ${targetDeal.toFixed(2)}) como promoção para exibir o selo % OFF!`,
      suggestedPrice: targetDeal,
      actionLabel: `Ativar Promo R$ ${targetDeal.toFixed(2)}`,
      recommendedPromo: priceDiscountCandidate,
    };
  }

  // 10. Saudável
  return {
    severity: 'saudavel',
    badge: '🟢 Saudável',
    title: 'Margem protegida e dentro da meta',
    explanation: `Lucro líquido de R$ ${metrics.lucroLiquidoPosAds.toFixed(2)} (${margemPosAdsPerc.toFixed(1)}%). Você ainda tem ${descMaxSobrePraticadoPerc.toFixed(1)}% de folga até o Preço Piso (R$ ${precoPiso.toFixed(2)}) caso queira entrar em promoção ou Ads (ACOS máx. recomendado: ${acosLimit}%).`,
    suggestedPrice: null,
    actionLabel: null,
  };
}

/**
 * Consulta Inteligência de Concorrência no Mercado Livre:
 * 1) /items/{id}/price_to_win (Preço oficial para ganhar do ML)
 * 2) /sites/MLB/search?q=... (Top concorrentes da 1ª página de busca)
 */
export async function fetchMlCompetitorIntel({ mlItemId, searchTitle, empresaId }) {
  const token = await getValidMlToken(empresaId);
  const headers = token?.access_token ? { Authorization: `Bearer ${token.access_token}` } : {};

  let priceToWinData = null;
  if (mlItemId) {
    try {
      priceToWinData = await mlProxyFetch(
        `/items/${encodeURIComponent(mlItemId)}/price_to_win?version=v2`,
        { headers }
      );
    } catch {
      // alguns itens artesanais sem catálogo não possuem price_to_win catalogado
    }
  }

  let promotions = [];
  if (mlItemId) {
    try {
      const promoResp = await mlProxyFetch(
        `/seller-promotions/items/${encodeURIComponent(mlItemId)}?app_version=v2`,
        { headers }
      );
      if (Array.isArray(promoResp)) {
        promotions = promoResp;
      } else if (Array.isArray(promoResp?.results)) {
        promotions = promoResp.results;
      }
    } catch {
      // ignora se não houver promoções
    }
  }

  const cleanQuery = String(searchTitle || '')
    .replace(/\b(kit|c\/|com|presente|brinde|unidades|un)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

  let competitors = [];
  if (cleanQuery) {
    try {
      const searchResp = await mlProxyFetch(
        `/sites/MLB/search?q=${encodeURIComponent(cleanQuery)}&limit=12`,
        { headers }
      );
      const rawResults = Array.isArray(searchResp?.results) ? searchResp.results : [];
      competitors = rawResults
        .filter((r) => r.id !== mlItemId && Number(r.price) > 0)
        .slice(0, 8)
        .map((r) => ({
          id: r.id,
          title: r.title,
          price: Number(r.price),
          originalPrice: Number(r.original_price || 0),
          permalink: r.permalink,
          thumbnail: (r.thumbnail || '').replace(/^http:\/\//i, 'https://'),
          freeShipping: Boolean(r.shipping?.free_shipping),
          logisticType: r.shipping?.logistic_type || '',
        }));
    } catch (e) {
      console.warn('[AdsIA] Aviso ao buscar concorrentes no ML:', e);
    }
  }

  const prices = competitors.map((c) => c.price).filter((p) => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const avgPrice =
    prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

  return {
    mlItemId,
    queryUsed: cleanQuery,
    priceToWinStatus: priceToWinData?.status || null,
    priceToWin: Number(priceToWinData?.price_to_win || 0),
    winnerPrice: Number(priceToWinData?.winner?.price || 0),
    promotions: promotions.map((p) => ({
      id: p.id,
      type: p.type,
      status: p.status,
      name: p.name || p.type,
      price: Number(p.price || 0),
      originalPrice: Number(p.original_price || 0),
    })),
    minPrice,
    avgPrice,
    maxPrice,
    competitors,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Consulta o consultor estratégico Gemini Flash (opcional, usando chave gratuita do Google AI Studio)
 */
export async function askGeminiStrategist({ apiKey, itemsSummary, rules }) {
  const cleanKey = String(apiKey || '').trim();
  if (!cleanKey) {
    throw new Error('Insira sua chave gratuita do Google Gemini (AI Studio) nas configurações acima para gerar o relatório narrativo por IA.');
  }

  const prompt = `Você é um Especialista Sênior em Mercado Livre Ads, Central de Promoções e Shopee Ads para uma fábrica de Impressão 3D (A&M 3D).
Regras inegociáveis definidas pelo dono da fábrica:
- Margem Líquida Mínima Intocável: ${rules.margemMinimaPerc}%
- Desconto Máximo sobre Cadastro: ${rules.maxDescontoCadastroPerc}%
- ACOS Alvo Máximo em Ads: ${rules.acosAlvoPerc}%
- Orçamento Diário Máximo: R$ ${rules.orcamentoDiarioMaxMl} (ML) / R$ ${rules.orcamentoDiarioMaxShopee} (Shopee)
- Instruções específicas da loja: "${rules.regrasPersonalizadas || ''}"

Abaixo estão os dados reais dos produtos (custo, preço atual, preço piso intocável, margem atual, estoque pronto, vendas no mês e concorrentes):
${JSON.stringify(itemsSummary, null, 2)}

Gere um Plano de Ação direto, prático e numerado em Português (Brasil) dividido em:
1. 🚨 Ações Imediatas de Proteção de Margem (Corta-Sangria / Preços abaixo do piso)
2. 📦 Plano de Giro de Estoque (Quais itens colocar em Promoção e qual % exata de desconto dar)
3. 🎯 Estratégia de Ads e Concorrência (Onde ligar Ads, onde usar Desconto em vez de Ads e onde sugerir Kits)`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(cleanKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35 },
      }),
    }
  );

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || 'Erro ao consultar a API do Gemini.');
  }

  return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta gerada.';
}

const STORAGE_PROMOS_ADS_CACHE_KEY = 'am3d_ml_promos_ads_cache_v1';

export function loadPromosAdsCache() {
  try {
    const raw = localStorage.getItem(STORAGE_PROMOS_ADS_CACHE_KEY);
    if (raw) return JSON.parse(raw) || { promosByItem: {}, adsByItem: {} };
  } catch {
    // ignore
  }
  return { promosByItem: {}, adsByItem: {} };
}

export function savePromosAdsCache(cacheObj) {
  try {
    localStorage.setItem(STORAGE_PROMOS_ADS_CACHE_KEY, JSON.stringify(cacheObj));
  } catch {
    // ignore
  }
}

const PROMO_TYPE_LABELS = {
  PRICE_DISCOUNT: 'Desconto Individual',
  DEAL: 'Campanha Tradicional ML',
  DOD: 'Oferta do Dia',
  LIGHTNING: 'Oferta Relâmpago',
  SMART: 'Desconto Inteligente',
  MARKETPLACE_CAMPAIGN: 'Campanha Co-participada ML',
  SELLER_CAMPAIGN: 'Campanha do Vendedor',
  PRE_NEGOTIATED: 'Desconto Pré-Negociado',
  UNHEALTHY_STOCK: 'Queima de Estoque ML',
  VOLUME: 'Desconto por Quantidade',
};

export function formatMlPromoType(type, name) {
  const cleanName = String(name || '').trim();
  const baseLabel = PROMO_TYPE_LABELS[type] || type || 'Promoção ML';
  if (cleanName && cleanName.toLowerCase() !== baseLabel.toLowerCase()) {
    return `${baseLabel} (${cleanName})`;
  }
  return baseLabel;
}

/**
 * Puxa em lote do Mercado Livre:
 * 1) % de promoção ativa em cada anúncio (/items?ids=...) + promoções vigentes/convites (/seller-promotions/items/{id})
 * 2) Gastos, cliques, vendas e ACOS do Product Ads nos últimos 7, 15 e 30 dias
 */
export async function fetchMlPromosAndAdsStats({ mlItemIds = [], empresaId }) {
  const uniqueIds = Array.from(new Set(mlItemIds.filter(Boolean)));
  const token = await getValidMlToken(empresaId);
  if (!token?.access_token) {
    throw new Error('Mercado Livre não conectado. Conecte em Estoque → Anúncios Mercado Livre.');
  }
  const headers = { Authorization: `Bearer ${token.access_token}` };

  const promosByItem = {};
  for (let i = 0; i < uniqueIds.length; i += 20) {
    const chunk = uniqueIds.slice(i, i + 20);
    try {
      const resp = await mlProxyFetch(
        `/items?ids=${encodeURIComponent(chunk.join(','))}&attributes=id,price,original_price,base_price,status,sold_quantity`,
        { headers }
      );
      const list = Array.isArray(resp) ? resp : [];
      list.forEach((entry) => {
        const body = entry?.body || entry;
        if (!body?.id) return;
        const price = Number(body.price || 0);
        const originalPrice = Number(body.original_price || 0);
        const promoPerc =
          originalPrice > price && originalPrice > 0
            ? ((originalPrice - price) / originalPrice) * 100
            : 0;
        promosByItem[body.id] = {
          price,
          originalPrice,
          promoPerc,
          soldQuantity: Number(body.sold_quantity || 0),
          status: body.status || '',
          activePromos: [],
          candidatePromos: [],
        };
      });
    } catch (e) {
      console.warn('[AdsIA] Aviso ao buscar preços/promoções em lote:', e);
    }
  }

  // Busca promoções vigentes (started) e convites disponíveis (candidate/pending) na Central de Promoções ML
  for (let i = 0; i < uniqueIds.length; i += 8) {
    const chunk = uniqueIds.slice(i, i + 8);
    await Promise.all(
      chunk.map(async (id) => {
        try {
          const pResp = await mlProxyFetch(
            `/seller-promotions/items/${encodeURIComponent(id)}?app_version=v2`,
            { headers }
          );
          const rawList = Array.isArray(pResp)
            ? pResp
            : Array.isArray(pResp?.results)
            ? pResp.results
            : [];
          const activePromos = [];
          const candidatePromos = [];
          const itemBase = promosByItem[id] || { price: 0, originalPrice: 0, promoPerc: 0 };

          rawList.forEach((p) => {
            if (!p || !p.type) return;
            const suggestedPrice = Number(
              p.price || p.suggested_discounted_price || p.max_discounted_price || p.min_discounted_price || 0
            );
            const origPrice = Number(p.original_price || itemBase.originalPrice || itemBase.price || 0);
            const discountPerc =
              origPrice > suggestedPrice && suggestedPrice > 0
                ? ((origPrice - suggestedPrice) / origPrice) * 100
                : itemBase.promoPerc || 0;

            const normalized = {
              id: p.id || p.type,
              type: p.type,
              name: p.name || '',
              label: formatMlPromoType(p.type, p.name),
              status: p.status,
              offerId: p.ref_id || p.offer_id || (Array.isArray(p.offers) && p.offers[0]?.id) || null,
              price: Number(p.price || 0),
              originalPrice: origPrice,
              suggestedPrice,
              minDiscountedPrice: Number(p.min_discounted_price || 0),
              maxDiscountedPrice: Number(p.max_discounted_price || 0),
              discountPerc,
              meliPercentage: Number(p.meli_percentage || 0),
              sellerPercentage: Number(p.seller_percentage || 0),
              startDate: p.start_date || null,
              finishDate: p.finish_date || null,
            };

            if (p.status === 'started') {
              activePromos.push(normalized);
            } else if (p.status === 'candidate' || p.status === 'pending') {
              candidatePromos.push(normalized);
            }
          });

          // Se houver promoção ativa (started) na Central de Promoções, o ML sempre aplica na vitrine o MENOR preço entre as promoções ativas
          const bestActive =
            activePromos
              .filter((ap) => ap.price > 0)
              .sort((a, b) => a.price - b.price)[0] || null;
          const resolvedOriginalPrice =
            bestActive && bestActive.originalPrice > bestActive.price
              ? bestActive.originalPrice
              : itemBase.originalPrice > 0
              ? itemBase.originalPrice
              : itemBase.price;
          const resolvedActivePrice =
            bestActive && bestActive.price > 0 ? bestActive.price : itemBase.price;
          const resolvedPromoPerc =
            resolvedOriginalPrice > resolvedActivePrice && resolvedOriginalPrice > 0
              ? ((resolvedOriginalPrice - resolvedActivePrice) / resolvedOriginalPrice) * 100
              : itemBase.promoPerc || 0;

          if (!promosByItem[id]) {
            promosByItem[id] = {
              price: resolvedActivePrice,
              originalPrice: resolvedOriginalPrice,
              promoPerc: resolvedPromoPerc,
              soldQuantity: 0,
              status: '',
              activePromos,
              candidatePromos,
            };
          } else {
            promosByItem[id].price = resolvedActivePrice;
            promosByItem[id].originalPrice = resolvedOriginalPrice;
            promosByItem[id].promoPerc = resolvedPromoPerc;
            promosByItem[id].activePromos = activePromos;
            promosByItem[id].candidatePromos = candidatePromos;
          }
        } catch {
          // alguns anúncios podem não retornar promoções
        }
      })
    );
  }

  // Busca data da última venda paga de cada item nos últimos 45 dias
  const lastSaleByItem = {};
  try {
    const sellerId = token.ml_user_id;
    if (sellerId) {
      const from45 = new Date();
      from45.setDate(from45.getDate() - 45);
      for (let pageOffset = 0; pageOffset < 100; pageOffset += 50) {
        const ordersResp = await mlProxyFetch(
          `/orders/search?seller=${encodeURIComponent(sellerId)}&order.status=paid&order.date_closed.from=${encodeURIComponent(from45.toISOString())}&sort=date_desc&limit=50&offset=${pageOffset}`,
          { headers }
        );
        const orders = Array.isArray(ordersResp?.results) ? ordersResp.results : [];
        orders.forEach((ord) => {
          const dt = ord.date_closed || ord.date_created;
          if (!dt) return;
          (ord.order_items || []).forEach((oi) => {
            const itId = oi?.item?.id;
            if (!itId) return;
            if (!lastSaleByItem[itId] || new Date(dt) > new Date(lastSaleByItem[itId])) {
              lastSaleByItem[itId] = dt;
            }
          });
        });
        if (orders.length < 50) break;
      }
    }
  } catch (ordErr) {
    console.warn('[AdsIA] Aviso ao buscar data da última venda:', ordErr);
  }

  // Busca dados do Product Ads (campanhas + anúncios em 7, 15 e 30 dias)
  const adsByItem = {};
  let advertiserId = null;
  let campaigns = [];
  let adsStatusNote = '';
  try {
    const advResp = await mlProxyFetch('/advertising/advertisers?product_id=PADS', {
      headers: { ...headers, 'api-version': '1' },
    });
    const advertisers = Array.isArray(advResp?.advertisers)
      ? advResp.advertisers
      : Array.isArray(advResp)
      ? advResp
      : [];
    const adv = advertisers.find((a) => a.site_id === 'MLB') || advertisers[0];

    if (adv?.advertiser_id) {
      advertiserId = adv.advertiser_id;
      const formatYmd = (d) => d.toISOString().slice(0, 10);
      const today = new Date();
      const dateTo = formatYmd(today);
      const from30 = new Date(today);
      from30.setDate(today.getDate() - 29);

      try {
        const campResp = await mlProxyFetch(
          `/advertising/MLB/advertisers/${encodeURIComponent(advertiserId)}/product_ads/campaigns/search?date_from=${formatYmd(from30)}&date_to=${dateTo}&metrics=clicks,prints,cost,acos,total_amount,units_quantity&limit=50`,
          { headers: { ...headers, 'api-version': '2' } }
        );
        campaigns = (Array.isArray(campResp?.results) ? campResp.results : []).map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          strategy: c.strategy,
          acosTarget: Number(c.acos_target || 0),
          dailyBudget: Number(c.daily_budget || c.budget || 0),
          metrics30d: c.metrics || {},
        }));
      } catch (campErr) {
        console.warn('[AdsIA] Aviso ao listar campanhas:', campErr);
      }

      for (const days of [7, 15, 30]) {
        const fromDate = new Date(today);
        fromDate.setDate(today.getDate() - (days - 1));
        const dateFrom = formatYmd(fromDate);

        try {
          const adsResp = await mlProxyFetch(
            `/advertising/MLB/advertisers/${encodeURIComponent(advertiserId)}/product_ads/ads/search?date_from=${dateFrom}&date_to=${dateTo}&metrics=clicks,prints,cost,acos,total_amount,units_quantity&limit=100`,
            { headers: { ...headers, 'api-version': '2' } }
          );
          const results = Array.isArray(adsResp?.results) ? adsResp.results : [];
          results.forEach((ad) => {
            const itemId = ad?.item_id;
            if (!itemId) return;
            if (!adsByItem[itemId]) adsByItem[itemId] = {};
            if (ad.status) adsByItem[itemId].adStatus = ad.status;
            if (ad.campaign_id) adsByItem[itemId].campaignId = ad.campaign_id;

            const m = ad?.metrics || ad || {};
            const cost = Number(m.cost || 0);
            const clicks = Number(m.clicks || 0);
            const prints = Number(m.prints || 0);
            const salesAmount = Number(m.total_amount || 0);
            const units = Number(m.units_quantity || 0);
            const acos =
              Number(m.acos || 0) > 0
                ? Number(m.acos)
                : salesAmount > 0 && cost > 0
                ? (cost / salesAmount) * 100
                : 0;

            adsByItem[itemId][days] = {
              cost,
              clicks,
              prints,
              salesAmount,
              units,
              acos,
            };
          });
        } catch (periodErr) {
          console.warn(`[AdsIA] Aviso ao buscar Product Ads (${days}d):`, periodErr);
        }
      }
    } else {
      adsStatusNote = 'Conta sem anunciante de Product Ads ativo no ML.';
    }
  } catch (adsErr) {
    adsStatusNote =
      adsErr?.status === 401 || adsErr?.status === 403
        ? 'Promoções (%) atualizadas! Para puxar gastos de Ads automaticamente, habilite a permissão "Product Ads" no App do ML (ou informe o gasto manualmente na coluna).'
        : `Promoções (%) atualizadas! Aviso Product Ads: ${adsErr.message}`;
  }

  const result = {
    advertiserId,
    campaigns,
    promosByItem,
    lastSaleByItem,
    adsByItem,
    adsStatusNote,
    updatedAt: new Date().toISOString(),
  };
  savePromosAdsCache(result);
  return result;
}

export async function updateMlAdStatusOrCampaign({
  advertiserId,
  mlItemId,
  status,
  campaignId,
  empresaId,
}) {
  if (!advertiserId || !mlItemId) {
    throw new Error('Advertiser ID ou Item ID ausente. Clique primeiro em "Puxar Promoções & Ads".');
  }
  const token = await getValidMlToken(empresaId);
  const body = {};
  if (status) body.status = status;
  if (campaignId) body.campaign_id = Number(campaignId);

  return mlProxyFetch(
    `/advertising/MLB/advertisers/${encodeURIComponent(advertiserId)}/product_ads/ads/${encodeURIComponent(mlItemId)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'api-version': '2',
      },
      body: JSON.stringify(body),
    }
  );
}

export async function createMlAdCampaign({
  advertiserId,
  name,
  acosTarget = 10,
  dailyBudget = 15,
  strategy = 'PROFITABILITY',
  empresaId,
}) {
  if (!advertiserId) {
    throw new Error('Advertiser ID ausente. Clique primeiro em "Puxar Promoções & Ads".');
  }
  const token = await getValidMlToken(empresaId);
  return mlProxyFetch(
    `/advertising/MLB/advertisers/${encodeURIComponent(advertiserId)}/product_ads/campaigns`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'api-version': '2',
      },
      body: JSON.stringify({
        name: String(name || '').trim(),
        budget: Number(dailyBudget || 15),
        acos_target: Number(acosTarget || 10),
        strategy,
        status: 'active',
        channel: 'marketplace',
      }),
    }
  );
}

export async function updateMlAdCampaign({
  advertiserId,
  campaignId,
  status,
  acosTarget,
  dailyBudget,
  empresaId,
}) {
  if (!advertiserId || !campaignId) {
    throw new Error('Advertiser ID ou Campaign ID ausente.');
  }
  const token = await getValidMlToken(empresaId);
  const body = {};
  if (status) body.status = status;
  if (acosTarget !== undefined) body.acos_target = Number(acosTarget);
  if (dailyBudget !== undefined) body.budget = Number(dailyBudget);

  return mlProxyFetch(
    `/advertising/MLB/advertisers/${encodeURIComponent(advertiserId)}/product_ads/campaigns/${encodeURIComponent(campaignId)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'api-version': '2',
      },
      body: JSON.stringify(body),
    }
  );
}

/**
 * Atualiza instantaneamente (em ~0.3s) os preços e promoções de APENAS 1 anúncio MLB,
 * evitando recarregar a tabela inteira e perder a posição da rolagem da tela.
 */
export async function fetchSingleMlItemPromo({ mlItemId, empresaId }) {
  if (!mlItemId) return null;
  const token = await getValidMlToken(empresaId);
  const headers = { Authorization: `Bearer ${token.access_token}` };

  const [itemResp, pResp] = await Promise.all([
    mlProxyFetch(
      `/items/${encodeURIComponent(mlItemId)}?attributes=id,price,original_price,base_price,status,sold_quantity`,
      { headers }
    ),
    mlProxyFetch(
      `/seller-promotions/items/${encodeURIComponent(mlItemId)}?app_version=v2`,
      { headers }
    ).catch(() => []),
  ]);

  const basePrice = Number(itemResp?.price || 0);
  const baseOrig = Number(itemResp?.original_price || 0);
  const rawList = Array.isArray(pResp)
    ? pResp
    : Array.isArray(pResp?.results)
    ? pResp.results
    : [];

  const activePromos = [];
  const candidatePromos = [];

  rawList.forEach((p) => {
    if (!p || !p.type) return;
    const suggestedPrice = Number(
      p.price || p.suggested_discounted_price || p.max_discounted_price || p.min_discounted_price || 0
    );
    const origPrice = Number(p.original_price || baseOrig || basePrice || 0);
    const discountPerc =
      origPrice > suggestedPrice && suggestedPrice > 0
        ? ((origPrice - suggestedPrice) / origPrice) * 100
        : 0;

    const normalized = {
      id: p.id || p.type,
      type: p.type,
      name: p.name || '',
      label: formatMlPromoType(p.type, p.name),
      status: p.status,
      offerId: p.ref_id || p.offer_id || (Array.isArray(p.offers) && p.offers[0]?.id) || null,
      price: Number(p.price || 0),
      originalPrice: origPrice,
      suggestedPrice,
      minDiscountedPrice: Number(p.min_discounted_price || 0),
      maxDiscountedPrice: Number(p.max_discounted_price || 0),
      discountPerc,
      meliPercentage: Number(p.meli_percentage || 0),
      sellerPercentage: Number(p.seller_percentage || 0),
      startDate: p.start_date || null,
      finishDate: p.finish_date || null,
    };

    if (p.status === 'started') {
      activePromos.push(normalized);
    } else if (p.status === 'candidate' || p.status === 'pending') {
      candidatePromos.push(normalized);
    }
  });

  const bestActive =
    activePromos.filter((ap) => ap.price > 0).sort((a, b) => a.price - b.price)[0] || null;
  const resolvedOriginalPrice =
    bestActive && bestActive.originalPrice > bestActive.price
      ? bestActive.originalPrice
      : baseOrig > 0
      ? baseOrig
      : basePrice;
  const resolvedActivePrice =
    bestActive && bestActive.price > 0 ? bestActive.price : basePrice;
  const resolvedPromoPerc =
    resolvedOriginalPrice > resolvedActivePrice && resolvedOriginalPrice > 0
      ? ((resolvedOriginalPrice - resolvedActivePrice) / resolvedOriginalPrice) * 100
      : 0;

  return {
    price: resolvedActivePrice,
    originalPrice: resolvedOriginalPrice,
    promoPerc: resolvedPromoPerc,
    soldQuantity: Number(itemResp?.sold_quantity || 0),
    status: itemResp?.status || '',
    activePromos,
    candidatePromos,
  };
}

/**
 * Remove (sai de) uma promoção ativa na Central de Promoções do Mercado Livre
 * (ex: sair da Campanha Tradicional Black Friday quando ela trava o preço abaixo do Preço Piso).
 */
export async function removeMlSellerPromotion({
  mlItemId,
  promotionId,
  promotionType,
  offerId,
  empresaId,
}) {
  if (!mlItemId || !promotionType) {
    throw new Error('Item MLB e tipo da promoção são obrigatórios.');
  }
  const token = await getValidMlToken(empresaId);
  const headers = { Authorization: `Bearer ${token.access_token}` };

  let resolvedOfferId = offerId || null;
  let allPromos = null;

  const loadPromosIfNeeded = async () => {
    if (allPromos) return allPromos;
    try {
      const resp = await mlProxyFetch(
        `/seller-promotions/items/${encodeURIComponent(mlItemId)}?app_version=v2`,
        { headers }
      );
      allPromos = Array.isArray(resp)
        ? resp
        : Array.isArray(resp?.results)
        ? resp.results
        : [];
    } catch {
      allPromos = [];
    }
    return allPromos;
  };

  if (
    !resolvedOfferId &&
    (promotionType === 'SMART' ||
      promotionType === 'PRE_NEGOTIATED' ||
      promotionType === 'MARKETPLACE_CAMPAIGN')
  ) {
    const list = await loadPromosIfNeeded();
    const match = list.find(
      (p) =>
        (promotionId && String(p.id) === String(promotionId)) ||
        p.type === promotionType
    );
    resolvedOfferId =
      match?.ref_id ||
      match?.offer_id ||
      (Array.isArray(match?.offers) && match.offers[0]?.id) ||
      null;
  }

  const buildDeleteUrl = (pType, pId, oId) => {
    const idParam =
      pId && pId !== pType ? `&promotion_id=${encodeURIComponent(pId)}` : '';
    const offerParam = oId ? `&offer_id=${encodeURIComponent(oId)}` : '';
    return `/seller-promotions/items/${encodeURIComponent(mlItemId)}?promotion_type=${encodeURIComponent(pType)}${idParam}${offerParam}&app_version=v2`;
  };

  try {
    return await mlProxyFetch(
      buildDeleteUrl(promotionType, promotionId, resolvedOfferId),
      {
        method: 'DELETE',
        headers,
      }
    );
  } catch (err) {
    // Se tentou sair de uma DEAL (Campanha Tradicional) mas há uma SMART (Desconto Inteligente) empilhada por cima, remove a SMART primeiro e depois a DEAL
    if (promotionType === 'DEAL' || promotionType === 'SELLER_CAMPAIGN') {
      const list = await loadPromosIfNeeded();
      const stackedSmart = list.filter(
        (p) =>
          p.status === 'started' &&
          (p.type === 'SMART' ||
            p.type === 'PRE_NEGOTIATED' ||
            p.type === 'MARKETPLACE_CAMPAIGN')
      );
      if (stackedSmart.length > 0) {
        for (const sp of stackedSmart) {
          const spOffer =
            sp.ref_id ||
            sp.offer_id ||
            (Array.isArray(sp.offers) && sp.offers[0]?.id) ||
            null;
          await mlProxyFetch(buildDeleteUrl(sp.type, sp.id, spOffer), {
            method: 'DELETE',
            headers,
          });
        }
        return await mlProxyFetch(
          buildDeleteUrl(promotionType, promotionId, resolvedOfferId),
          {
            method: 'DELETE',
            headers,
          }
        );
      }
    }
    throw err;
  }
}

/**
 * Aplica o preço alvo como PROMOÇÃO (Central de Promoções do ML),
 * mantendo o Preço de Cadastro (original_price) intacto para preservar o selo % OFF!
 * Se o anúncio estiver preso em uma Campanha Tradicional (ex: Black Friday / DEAL) cujo teto máximo
 * seja menor que o targetPrice, sai automaticamente dessa campanha e aplica Desconto Individual (PRICE_DISCOUNT).
 */
export async function applyMlSellerPromotion({
  mlItemId,
  targetPrice,
  promotionId,
  promotionType,
  empresaId,
}) {
  if (!mlItemId) throw new Error('Item MLB não informado.');
  const token = await getValidMlToken(empresaId);
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const cleanTarget = Number(Number(targetPrice).toFixed(2));

  const fetchPromos = async () => {
    const promoResp = await mlProxyFetch(
      `/seller-promotions/items/${encodeURIComponent(mlItemId)}?app_version=v2`,
      { headers }
    );
    return Array.isArray(promoResp)
      ? promoResp
      : Array.isArray(promoResp?.results)
      ? promoResp.results
      : [];
  };

  let promoList = await fetchPromos();

  // Verifica se há alguma campanha ativa (DEAL, SMART, LIGHTNING, DOD, etc.) travando o preço abaixo do cleanTarget
  const blockingStartedPromos = promoList.filter((p) => {
    if (p.status !== 'started') return false;
    if (promotionId && String(p.id) === String(promotionId)) return false;
    // Se estamos subindo o preço para corrigir Piso e há uma DEAL/SMART/etc ativa com preço menor que o alvo
    const curDealPrice = Number(p.price || 0);
    const maxAllowed = Number(p.max_discounted_price || 0);
    if (p.type !== 'PRICE_DISCOUNT' && ((maxAllowed > 0 && maxAllowed < cleanTarget - 0.02) || (curDealPrice > 0 && curDealPrice < cleanTarget - 0.02))) {
      return true;
    }
    return false;
  });

  const removedBlocking = [];
  for (const bp of blockingStartedPromos) {
    try {
      await removeMlSellerPromotion({
        mlItemId,
        promotionId: bp.id,
        promotionType: bp.type,
        empresaId,
      });
      removedBlocking.push(bp);
    } catch (remErr) {
      console.warn('[AdsIA] Aviso ao sair de campanha bloqueadora:', remErr);
    }
  }

  if (removedBlocking.length > 0) {
    try {
      promoList = await fetchPromos();
    } catch {
      // mantém lista anterior
    }
  }

  // Se o usuário escolheu um convite específico de promoção, prioriza ele; senão, pega PRICE_DISCOUNT ou campanha ativa/candidata
  const eligible =
    (promotionId
      ? promoList.find((p) => String(p.id) === String(promotionId) || p.type === promotionType)
      : null) ||
    promoList.find((p) => p.type === 'PRICE_DISCOUNT' && (p.status === 'started' || p.status === 'candidate')) ||
    promoList.find(
      (p) =>
        (p.type === 'SELLER_CAMPAIGN' || p.type === 'DEAL' || p.type === 'SMART' || p.type === 'MARKETPLACE_CAMPAIGN') &&
        (p.status === 'started' || p.status === 'candidate' || p.status === 'pending') &&
        (Number(p.max_discounted_price || 0) === 0 || Number(p.max_discounted_price) >= cleanTarget - 0.05)
    ) ||
    null;

  if (!eligible) {
    return {
      appliedAs: removedBlocking.length > 0 ? 'removed_blocking_deal' : 'no_eligible_promo',
      removedBlocking,
      promoList,
    };
  }

  const payload = {
    deal_price: cleanTarget,
    promotion_type: eligible.type,
  };
  if (eligible.id && eligible.id !== eligible.type) {
    payload.promotion_id = eligible.id;
  }
  if (eligible.type === 'PRICE_DISCOUNT' && !payload.promotion_id) {
    // Usa sempre a data local do Brasil (GMT-3) para iniciar imediatamente mesmo após as 21h!
    const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const brEnd = new Date(brNow.getTime() + 14 * 24 * 60 * 60 * 1000);
    payload.start_date = `${brNow.toISOString().slice(0, 10)}T00:00:00`;
    payload.finish_date = `${brEnd.toISOString().slice(0, 10)}T23:59:59`;
  }

  try {
    // Caso 1: Se for PRICE_DISCOUNT e já estiver "started", o ML exige DELETE primeiro, aguardar ~1.5s para virar "candidate" e então POST
    if (eligible.type === 'PRICE_DISCOUNT' && eligible.status === 'started') {
      await removeMlSellerPromotion({
        mlItemId,
        promotionId: eligible.id,
        promotionType: 'PRICE_DISCOUNT',
        empresaId,
      });
      await new Promise((r) => setTimeout(r, 1600));
      // Se também houver uma DEAL ativa (ex: Black Friday) que aceita esse preço, atualiza ela via PUT também
      const activeDeal = promoList.find(
        (p) => (p.type === 'DEAL' || p.type === 'SELLER_CAMPAIGN') && p.status === 'started'
      );
      if (activeDeal && activeDeal.id) {
        try {
          await mlProxyFetch(
            `/seller-promotions/items/${encodeURIComponent(mlItemId)}?app_version=v2`,
            {
              method: 'PUT',
              headers,
              body: JSON.stringify({
                promotion_id: activeDeal.id,
                promotion_type: activeDeal.type,
                deal_price: cleanTarget,
              }),
            }
          );
        } catch {
          // se o novo preço não for aceito na DEAL, segue com o PRICE_DISCOUNT
        }
      }
    }

    // Caso 2: Se a promoção escolhida for DEAL ou SELLER_CAMPAIGN e já estiver "started", o método da API do ML é PUT (e não POST!)
    const httpMethod =
      (eligible.type === 'DEAL' || eligible.type === 'SELLER_CAMPAIGN') &&
      eligible.status === 'started'
        ? 'PUT'
        : 'POST';

    const res = await mlProxyFetch(
      `/seller-promotions/items/${encodeURIComponent(mlItemId)}?app_version=v2`,
      {
        method: httpMethod,
        headers,
        body: JSON.stringify(payload),
      }
    );

    return {
      appliedAs: 'promotion',
      promotion: eligible,
      removedBlocking,
      result: res,
    };
  } catch (postErr) {
    // Fallback: se o POST de PRICE_DISCOUNT deu "No candidates found", mas há uma DEAL ativa (ex: Black Friday), atualiza a DEAL com PUT!
    const fallbackDeal = promoList.find(
      (p) => (p.type === 'DEAL' || p.type === 'SELLER_CAMPAIGN') && p.status === 'started'
    );
    if (fallbackDeal && fallbackDeal.id) {
      try {
        const putDealRes = await mlProxyFetch(
          `/seller-promotions/items/${encodeURIComponent(mlItemId)}?app_version=v2`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              promotion_id: fallbackDeal.id,
              promotion_type: fallbackDeal.type,
              deal_price: cleanTarget,
            }),
          }
        );
        return {
          appliedAs: 'promotion',
          promotion: fallbackDeal,
          removedBlocking,
          result: putDealRes,
        };
      } catch {
        // continua para o próximo fallback
      }
    }
    // Se a promoção escolhida rejeitou o preço (ex: DEAL com teto oculto) e ela estava ativa, sai dela e tenta PRICE_DISCOUNT
    if (eligible.status === 'started' && eligible.type !== 'PRICE_DISCOUNT') {
      try {
        await removeMlSellerPromotion({
          mlItemId,
          promotionId: eligible.id,
          promotionType: eligible.type,
          empresaId,
        });
        removedBlocking.push(eligible);
        const freshList = await fetchPromos();
        const indiv = freshList.find(
          (p) => p.type === 'PRICE_DISCOUNT' && (p.status === 'started' || p.status === 'candidate')
        );
        if (indiv) {
          const retryPayload = {
            deal_price: cleanTarget,
            promotion_id: indiv.id,
            promotion_type: 'PRICE_DISCOUNT',
          };
          const retryRes = await mlProxyFetch(
            `/seller-promotions/items/${encodeURIComponent(mlItemId)}?app_version=v2`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify(retryPayload),
            }
          );
          return {
            appliedAs: 'promotion',
            promotion: indiv,
            removedBlocking,
            result: retryRes,
          };
        }
        return {
          appliedAs: 'removed_blocking_deal',
          removedBlocking,
          promoList: freshList,
        };
      } catch {
        throw postErr;
      }
    }
    throw postErr;
  }
}

/**
 * Padroniza o Preço de Cadastro (base price no ML) e já aplica a Promoção de 30% OFF (Preço de Venda)
 * em um anúncio do Mercado Livre. Remove qualquer promoção ativa (PRICE_DISCOUNT, DEAL Black Friday, etc.)
 * que esteja travando o preço antigo, sobe o Preço de Cadastro e ativa a promoção de 30% OFF.
 */
export async function syncMlBaseCadastroAndPromo({
  mlItemId,
  cadastroPrice,
  vendaPrice,
  empresaId,
}) {
  if (!mlItemId) throw new Error('Item MLB não informado.');
  const token = await getValidMlToken(empresaId);
  const headers = { Authorization: `Bearer ${token.access_token}` };

  const cleanCadastro = Number(Number(cadastroPrice).toFixed(2));
  const cleanVenda = Number(Number(vendaPrice).toFixed(2));

  let promoList = [];
  try {
    const promoResp = await mlProxyFetch(
      `/seller-promotions/items/${encodeURIComponent(mlItemId)}?app_version=v2`,
      { headers }
    );
    promoList = Array.isArray(promoResp)
      ? promoResp
      : Array.isArray(promoResp?.results)
      ? promoResp.results
      : [];
  } catch {
    promoList = [];
  }

  // Remove TODAS as promoções ativas (started) — começando por SMART/PRE_NEGOTIATED empilhadas e depois DEAL/PRICE_DISCOUNT
  const startedPromos = promoList
    .filter((p) => p.status === 'started')
    .sort((a, b) => (a.type === 'SMART' || a.type === 'PRE_NEGOTIATED' ? -1 : b.type === 'SMART' || b.type === 'PRE_NEGOTIATED' ? 1 : 0));
  for (const sp of startedPromos) {
    try {
      await removeMlSellerPromotion({
        mlItemId,
        promotionId: sp.id,
        promotionType: sp.type,
        offerId: sp.ref_id || sp.offer_id || (Array.isArray(sp.offers) && sp.offers[0]?.id) || null,
        empresaId,
      });
    } catch {
      // ignora se alguma campanha co-participada exigir remoção manual
    }
  }

  let baseUpdated = false;
  let promoApplied = false;

  await mlProxyFetch(`/items/${encodeURIComponent(mlItemId)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ price: cleanCadastro }),
  });
  baseUpdated = true;

  // Agora tenta aplicar/reativar a promoção de 30% OFF (cleanVenda)
  try {
    const applyRes = await applyMlSellerPromotion({
      mlItemId,
      targetPrice: cleanVenda,
      empresaId,
    });
    promoApplied = applyRes.appliedAs === 'promotion';
  } catch {
    promoApplied = false;
  }

  return {
    mlItemId,
    cadastroPrice: cleanCadastro,
    vendaPrice: cleanVenda,
    baseUpdated,
    promoApplied,
  };
}

/**
 * Puxa em lote da Shopee (quando a loja Shopee estiver conectada):
 * 1) Anúncios, preços cheios (original_price) e preços em promoção (current_price)
 * 2) Promoções da Loja ativas (/api/v2/discount/get_discount_list)
 * 3) Data da última venda paga nos últimos 45 dias (em janelas de 15d) para calcular a Margem Dinâmica (15% / 20% / 25%)
 * 4) Campanhas de Shopee Ads (/api/v2/ads/get_product_level_campaign_id_list)
 */
export async function fetchShopeePromosAndAdsStats({ empresaId }) {
  const tokenObj = await getValidShopeeToken(empresaId);
  const token = tokenObj.access_token;
  const shopId = tokenObj.ml_user_id;

  const syncRes = await syncListingsFromShopee(empresaId);
  const listings = syncRes?.listings || [];

  const promosByItem = {};
  listings.forEach((l) => {
    const itemId = String(l.ml_item_id || '');
    if (!itemId) return;
    const origPrice = Number(l.price || 0);
    const curPrice = Number(l.price_promo || l.price || 0);
    const promoPerc =
      origPrice > curPrice && origPrice > 0
        ? ((origPrice - curPrice) / origPrice) * 100
        : 0;
    const activePromos =
      promoPerc >= 0.5
        ? [
            {
              id: `SHOPEE_PROMO_${itemId}`,
              type: 'PRICE_DISCOUNT',
              name: 'Promoção da Loja Shopee',
              label: 'Oferta da Loja Shopee',
              status: 'started',
              price: curPrice,
              originalPrice: origPrice,
              suggestedPrice: curPrice,
              discountPerc: promoPerc,
              meliPercentage: 0,
            },
          ]
        : [];
    const candidatePromos =
      promoPerc < 0.5
        ? [
            {
              id: `SHOPEE_CAND_${itemId}`,
              type: 'PRICE_DISCOUNT',
              name: 'Criar Promoção na Loja Shopee',
              label: 'Promoção da Loja Shopee',
              status: 'candidate',
              price: Number((origPrice * 0.7).toFixed(2)),
              originalPrice: origPrice,
              suggestedPrice: Number((origPrice * 0.7).toFixed(2)),
              discountPerc: 30,
              meliPercentage: 0,
            },
          ]
        : [];

    promosByItem[itemId] = {
      price: curPrice,
      originalPrice: origPrice,
      promoPerc,
      soldQuantity: null,
      status: l.status || 'active',
      activePromos,
      candidatePromos,
    };
  });

  // Busca data da última venda nos últimos 45 dias (3 blocos de 15 dias)
  const lastSaleByItem = {};
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const daySec = 24 * 60 * 60;
    const chunks15 = [
      { from: nowSec - 15 * daySec, to: nowSec },
      { from: nowSec - 30 * daySec, to: nowSec - 15 * daySec },
      { from: nowSec - 45 * daySec, to: nowSec - 30 * daySec },
    ];
    const orderSns = [];
    for (const rng of chunks15) {
      const ordList = await shopeeProxyFetch('/api/v2/order/get_order_list', {
        method: 'GET',
        token,
        shopId,
        query: {
          time_range_field: 'pay_time',
          time_from: rng.from,
          time_to: rng.to,
          page_size: 50,
        },
      });
      const list = Array.isArray(ordList?.response?.order_list)
        ? ordList.response.order_list
        : [];
      list.forEach((o) => {
        if (o?.order_sn && !orderSns.includes(o.order_sn)) orderSns.push(o.order_sn);
      });
    }

    for (let i = 0; i < Math.min(orderSns.length, 100); i += 50) {
      const chunk = orderSns.slice(i, i + 50).join(',');
      const det = await shopeeProxyFetch('/api/v2/order/get_order_detail', {
        method: 'GET',
        token,
        shopId,
        query: {
          order_sn_list: chunk,
          response_optional_fields: 'item_list,pay_time,order_status',
        },
      });
      const orders = Array.isArray(det?.response?.order_list)
        ? det.response.order_list
        : [];
      orders.forEach((ord) => {
        const payTimeSec = Number(ord.pay_time || ord.create_time || 0);
        if (!payTimeSec) return;
        const iso = new Date(payTimeSec * 1000).toISOString();
        (ord.item_list || []).forEach((it) => {
          const itId = String(it.item_id || '');
          if (!itId) return;
          if (!lastSaleByItem[itId] || new Date(iso) > new Date(lastSaleByItem[itId])) {
            lastSaleByItem[itId] = iso;
          }
        });
      });
    }
  } catch (e) {
    console.warn('[AdsIA Shopee] Aviso ao buscar histórico de vendas 45d:', e);
  }

  // Busca campanhas de Shopee Ads se a API de Ads estiver liberada para o App
  const adsByItem = {};
  const campaigns = [];
  try {
    const campResp = await shopeeProxyFetch(
      '/api/v2/ads/get_product_level_campaign_id_list',
      {
        method: 'GET',
        token,
        shopId,
        query: { ad_type: 'all', offset: 0, limit: 100 },
      }
    );
    const campList = Array.isArray(campResp?.response?.campaign_list)
      ? campResp.response.campaign_list
      : [];
    campList.forEach((c) => {
      if (c.item_id) {
        adsByItem[String(c.item_id)] = {
          campaignId: c.campaign_id,
          adStatus: c.ad_status === 'ongoing' ? 'active' : 'paused',
          7: { cost: 0, clicks: 0, prints: 0, units: 0, totalAmount: 0, acos: 0 },
          15: { cost: 0, clicks: 0, prints: 0, units: 0, totalAmount: 0, acos: 0 },
          30: { cost: 0, clicks: 0, prints: 0, units: 0, totalAmount: 0, acos: 0 },
        };
      }
    });
  } catch {
    // Escopo de Shopee Ads opcional
  }

  return {
    updatedAt: new Date().toISOString(),
    advertiserId: shopId,
    campaigns,
    promosByItem,
    adsByItem,
    lastSaleByItem,
    listings,
  };
}

/**
 * Atualiza o Preço de Cadastro (original_price) de um anúncio na Shopee
 * e aplica o Preço Promocional (30% OFF) via API de Descontos da Shopee (/api/v2/discount).
 */
export async function syncShopeeBaseCadastroAndPromo({
  itemId,
  variations = [],
  cadastroPrice,
  vendaPrice,
  empresaId,
}) {
  if (!itemId) throw new Error('ID do item Shopee não informado.');
  const tokenObj = await getValidShopeeToken(empresaId);
  const token = tokenObj.access_token;
  const shopId = tokenObj.ml_user_id;

  const cleanCadastro = Number(Number(cadastroPrice).toFixed(2));
  const cleanVenda = Number(Number(vendaPrice).toFixed(2));

  const priceList =
    Array.isArray(variations) && variations.length > 0
      ? variations.map((v) => ({
          model_id: Number(v.model_id || v.id || 0),
          original_price: cleanCadastro,
        }))
      : [{ model_id: 0, original_price: cleanCadastro }];

  let baseUpdated = false;
  let promoApplied = false;

  await shopeeProxyFetch('/api/v2/product/update_price', {
    method: 'POST',
    token,
    shopId,
    body: {
      item_id: Number(itemId),
      price_list: priceList,
    },
  });
  baseUpdated = true;

  // Tenta criar/adicionar em uma campanha de desconto da loja na Shopee (/api/v2/discount)
  try {
    const nowSec = Math.floor(Date.now() / 1000) + 120;
    const endSec = nowSec + 60 * 24 * 60 * 60; // 60 dias
    const discResp = await shopeeProxyFetch('/api/v2/discount/add_discount', {
      method: 'POST',
      token,
      shopId,
      body: {
        discount_name: `Oferta AM3D ${new Date().toISOString().slice(0, 10)}`,
        start_time: nowSec,
        end_time: endSec,
      },
    });
    const discountId = discResp?.response?.discount_id;
    if (discountId) {
      const modelPromos =
        Array.isArray(variations) && variations.length > 0
          ? variations.map((v) => ({
              model_id: Number(v.model_id || v.id || 0),
              model_promotion_price: cleanVenda,
            }))
          : [];
      await shopeeProxyFetch('/api/v2/discount/add_discount_item', {
        method: 'POST',
        token,
        shopId,
        body: {
          discount_id: Number(discountId),
          item_list: [
            {
              item_id: Number(itemId),
              purchase_limit: 0,
              ...(modelPromos.length > 0
                ? { model_list: modelPromos }
                : { item_promotion_price: cleanVenda }),
            },
          ],
        },
      });
      promoApplied = true;
    }
  } catch (discErr) {
    console.warn('[AdsIA Shopee] Aviso ao criar desconto promocional na Shopee:', discErr);
  }

  return {
    itemId,
    cadastroPrice: cleanCadastro,
    vendaPrice: cleanVenda,
    baseUpdated,
    promoApplied,
  };
}

/**
 * Avalia qual é a melhor escolha de Ads para o anúncio (Ativar / Pausar / Mover Campanha)
 * cruzando Estoque, Margem Pós-Ads, Gasto em 30d/15d/7d e Vendas.
 */
export function evaluateAdsChoice({
  adStatus,
  campaignId,
  campaigns = [],
  metrics,
  estoqueTotal,
  vendasMes,
  soldQuantityTotal,
  rules,
}) {
  const minMargin = parseNumber(rules.margemMinimaPerc);
  const acosLimit = parseNumber(rules.acosAlvoPerc || 10);
  const isActive = adStatus === 'active';
  const currentCamp = campaigns.find((c) => String(c.id) === String(campaignId));

  // 1. Estoque crítico (<= 2 un) e Ads ativo -> Pausar para não desperdiçar clique
  if (isActive && estoqueTotal <= parseNumber(rules.estoqueBaixoProtecaoMax || 3)) {
    return {
      action: 'pause',
      badge: '🔥 Pausar Ads (Estoque Baixo)',
      reason: `Restam apenas ${estoqueTotal} un. em estoque. Pause o Ads para vender sem pagar cliques.`,
      buttonLabel: '⏸️ Pausar Ads',
      color: '#D97706',
    };
  }

  // 2. Corta-Sangria: gastou sem retorno ou ACOS estourou e margem furou o piso
  if (
    isActive &&
    ((metrics.gastoAdsMes >= Math.max(8, metrics.lucroLiquidoSemAds) && vendasMes === 0) ||
      (metrics.acosRealPerc > acosLimit * 1.4 && metrics.margemPosAdsPerc < minMargin))
  ) {
    return {
      action: 'pause',
      badge: '🔴 Cortar Sangria Ads',
      reason: `Gasto de R$ ${metrics.gastoAdsMes.toFixed(2)} (ACOS ${metrics.acosRealPerc.toFixed(1)}%) está comendo sua margem mínima.`,
      buttonLabel: '⏸️ Pausar Ads',
      color: '#DC2626',
    };
  }

  // 3. Ads pausado ou não cadastrado, mas tem margem folgada e bom estoque -> Ativar Ads
  if (
    !isActive &&
    estoqueTotal >= 5 &&
    metrics.precoPraticado > metrics.precoPiso &&
    metrics.margemSemAdsPerc >= minMargin + 4
  ) {
    const isNew = soldQuantityTotal !== null && soldQuantityTotal < 10;
    return {
      action: 'activate',
      badge: isNew ? '🚀 Ativar Ads (Lançamento)' : '📦 Ativar Ads (Giro)',
      reason: `Margem saudável (${metrics.margemSemAdsPerc.toFixed(1)}%) e ${estoqueTotal} un. em estoque. Bom candidato para Ads dentro de ACOS ${acosLimit}%.`,
      buttonLabel: '▶️ Ativar Ads',
      color: '#2563EB',
    };
  }

  // 4. Ads ativo e saudável
  if (isActive) {
    return {
      action: 'keep',
      badge: `🟢 Ads Ativo${currentCamp ? ` (${currentCamp.name})` : ''}`,
      reason: `Rodando dentro da trava de margem (${metrics.margemPosAdsPerc.toFixed(1)}% líquida).`,
      buttonLabel: null,
      color: '#059669',
    };
  }

  return {
    action: 'wait',
    badge: '⚪ Ads Pausado',
    reason:
      estoqueTotal < 5
        ? 'Estoque baixo — mantenha pausado até repor.'
        : 'Margem justa — priorize ajuste de preço antes de ligar Ads.',
    buttonLabel: null,
    color: '#64748B',
  };
}
