import { getResultados, parseNumber } from '../utils/financeCalculators';
import { mlProxyFetch, getValidMlToken } from './mercadolivre';

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

  const precoBaseVenda = parseNumber(effectiveFt.precoVendaManual);
  const precoCadastro = precoBaseVenda > 0 ? precoBaseVenda / 0.7 : 0;
  const precoPraticado =
    parseNumber(effectiveFt.precoRealAtivo) > 0
      ? parseNumber(effectiveFt.precoRealAtivo)
      : precoBaseVenda;

  // Métricas de Ads informadas ou puxadas da API
  const gastoAdsMes = parseNumber(itemAdsMetrics.gastoAds);
  const vendasMes = Math.max(0, Number(itemAdsMetrics.vendasMes || 0));
  const faturamentoMes = precoPraticado * vendasMes;

  const acosRealPerc =
    faturamentoMes > 0 && gastoAdsMes > 0
      ? (gastoAdsMes / faturamentoMes) * 100
      : parseNumber(itemAdsMetrics.acosPerc || 0);

  const margemMinima = Math.max(0, parseNumber(rules.margemMinimaPerc));
  const acosParaPiso = acosRealPerc > 0 ? acosRealPerc : 0;

  // Denominador para Preço de Queima (Margem 0%)
  const denomQueima = 1 - (aliquotaCanalPerc + acosParaPiso) / 100;
  const precoQueima = denomQueima > 0.05 ? custoFixoUnit / denomQueima : custoFixoUnit * 2;

  // Denominador para Preço Piso (garantindo margemMinima% líquida após todos os custos + Ads)
  const denomPiso = 1 - (aliquotaCanalPerc + acosParaPiso + margemMinima) / 100;
  const precoPiso = denomPiso > 0.05 ? custoFixoUnit / denomPiso : precoQueima * 1.25;

  // Lucro e margem reais considerando o preço praticado hoje e o gasto de Ads
  const custoVariavelHoje = precoPraticado * ((aliquotaCanalPerc + acosRealPerc) / 100);
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

  // 8. Saudável
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

/**
 * Puxa em lote do Mercado Livre:
 * 1) % de promoção ativa em cada anúncio (/items?ids=...)
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
        };
      });
    } catch (e) {
      console.warn('[AdsIA] Aviso ao buscar preços/promoções em lote:', e);
    }
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
