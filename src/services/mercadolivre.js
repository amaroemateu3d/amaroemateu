const ML_API_BASE = 'https://api.mercadolibre.com';
const ML_AUTH_BASE = 'https://auth.mercadolivre.com.br/authorization';
const DEFAULT_EMPRESA_ID = 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9';

const LOCAL_TOKEN_CACHE_KEY = 'am3d_ml_token_cache';
const LOCAL_LISTINGS_CACHE_KEY = 'am3d_ml_listings_cache';
const LOCAL_APP_CONFIG_KEY = 'am3d_ml_app_credentials';

function getSupaHeaders(accessToken = null) {
  const supaKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return {
    apikey: supaKey,
    Authorization: `Bearer ${accessToken || supaKey}`,
    'Content-Type': 'application/json'
  };
}

function getSupaUrl() {
  return import.meta.env.VITE_SUPABASE_URL;
}

export function getMlAppCredentials() {
  let savedCustom = {};
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_APP_CONFIG_KEY);
      if (raw) savedCustom = JSON.parse(raw) || {};
    } catch {
      // ignore
    }
  }

  const defaultRedirect = 'https://amaroemateu.vercel.app/estoque';

  return {
    clientId: String(savedCustom.clientId || import.meta.env.VITE_ML_CLIENT_ID || '5281469754637132').trim(),
    clientSecret: String(savedCustom.clientSecret || import.meta.env.VITE_ML_CLIENT_SECRET || '').trim(),
    redirectUri: String(savedCustom.redirectUri || import.meta.env.VITE_ML_REDIRECT_URI || defaultRedirect).trim()
  };
}

export function saveMlAppCredentialsLocal({ clientId, clientSecret, redirectUri }) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    LOCAL_APP_CONFIG_KEY,
    JSON.stringify({
      clientId: String(clientId || '').trim(),
      clientSecret: String(clientSecret || '').trim(),
      redirectUri: String(redirectUri || '').trim()
    })
  );
}

export function getMlAuthUrl() {
  const { clientId, redirectUri } = getMlAppCredentials();
  if (!clientId) {
    throw new Error('VITE_ML_CLIENT_ID não configurado. Configure as credenciais do App do Mercado Livre.');
  }
  if (!redirectUri) {
    throw new Error('VITE_ML_REDIRECT_URI não configurado.');
  }
  return `${ML_AUTH_BASE}?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

export function extractMlCodeFromInput(inputStr) {
  const trimmed = String(inputStr || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('?')) {
    try {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://dummy.local/${trimmed}`);
      const codeParam = url.searchParams.get('code');
      if (codeParam) return codeParam.trim();
    } catch {
      const match = trimmed.match(/[?&]code=([^&#\s]+)/i);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
  }

  return trimmed;
}

export async function mlProxyFetch(mlPathOrUrl, options = {}) {
  const targetUrl = mlPathOrUrl.startsWith('http')
    ? mlPathOrUrl
    : `${ML_API_BASE}${mlPathOrUrl.startsWith('/') ? '' : '/'}${mlPathOrUrl}`;

  const proxyUrl = `/api/mlproxy?target=${encodeURIComponent(targetUrl)}`;

  const resp = await fetch(proxyUrl, options);
  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    const msg = data?.message || data?.error_description || data?.error || `Erro HTTP ${resp.status} no Mercado Livre`;
    const err = new Error(msg);
    err.status = resp.status;
    err.mlData = data;
    throw err;
  }

  return data;
}

// ============================================================================
// GERENCIAMENTO DE TOKENS NO SUPABASE (COM AUTO-REFRESH DE 30 MINUTOS)
// ============================================================================

export async function fetchStoredMlToken(empresaId = DEFAULT_EMPRESA_ID) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  try {
    const resp = await fetch(
      `${getSupaUrl()}/rest/v1/marketplace_tokens?platform=eq.ml&order=updated_at.desc&limit=1`,
      { headers: getSupaHeaders() }
    );
    if (resp.ok) {
      const rows = await resp.json();
      if (Array.isArray(rows) && rows.length > 0) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(`${LOCAL_TOKEN_CACHE_KEY}_${safeEmpId}`, JSON.stringify(rows[0]));
        }
        return rows[0];
      }
      return null;
    }
  } catch (e) {
    console.warn('[ML Service] Aviso ao ler marketplace_tokens do Supabase:', e);
  }

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(`${LOCAL_TOKEN_CACHE_KEY}_${safeEmpId}`);
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
  }
  return null;
}

export async function saveMlTokenToDb(tokenPayload, empresaId = DEFAULT_EMPRESA_ID) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  const nowIso = new Date().toISOString();

  const record = {
    empresa_id: safeEmpId,
    platform: 'ml',
    access_token: tokenPayload.access_token,
    refresh_token: tokenPayload.refresh_token,
    ml_user_id: String(tokenPayload.ml_user_id || tokenPayload.user_id || ''),
    ml_nickname: tokenPayload.ml_nickname || null,
    expires_at: tokenPayload.expires_at,
    updated_at: nowIso
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(`${LOCAL_TOKEN_CACHE_KEY}_${safeEmpId}`, JSON.stringify(record));
  }

  try {
    // Verifica se já existe registro para atualizar ou inserir
    const existing = await fetch(
      `${getSupaUrl()}/rest/v1/marketplace_tokens?platform=eq.ml&select=id`,
      { headers: getSupaHeaders() }
    );

    if (existing.ok) {
      const rows = await existing.json();
      if (Array.isArray(rows) && rows.length > 0) {
        const patchResp = await fetch(
          `${getSupaUrl()}/rest/v1/marketplace_tokens?id=eq.${rows[0].id}`,
          {
            method: 'PATCH',
            headers: { ...getSupaHeaders(), Prefer: 'return=representation' },
            body: JSON.stringify(record)
          }
        );
        if (patchResp.ok) {
          const updated = await patchResp.json();
          return updated?.[0] || record;
        }
      } else {
        const postResp = await fetch(`${getSupaUrl()}/rest/v1/marketplace_tokens`, {
          method: 'POST',
          headers: { ...getSupaHeaders(), Prefer: 'return=representation' },
          body: JSON.stringify(record)
        });
        if (postResp.ok) {
          const inserted = await postResp.json();
          return inserted?.[0] || record;
        }
      }
    }
  } catch (e) {
    console.warn('[ML Service] Aviso ao gravar token no Supabase (mantido cache local):', e);
  }

  return record;
}

export async function exchangeMlCodeForToken(rawCodeOrUrl, empresaId = DEFAULT_EMPRESA_ID) {
  const code = extractMlCodeFromInput(rawCodeOrUrl);
  if (!code) {
    throw new Error('Código de autorização (?code=...) inválido ou vazio.');
  }

  const { clientId, clientSecret, redirectUri } = getMlAppCredentials();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Credenciais do App Mercado Livre (Client ID, Secret ou Redirect URI) incompletas.');
  }

  const formBody = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri
  }).toString();

  const tokenData = await mlProxyFetch('/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody
  });

  const expiresInSec = Number(tokenData.expires_in || 21600);
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

  // Busca dados da conta (/users/me) para salvar nickname e confirmar user_id
  let nickname = null;
  let userId = String(tokenData.user_id || '');
  try {
    const meData = await mlProxyFetch('/users/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    if (meData?.nickname) nickname = meData.nickname;
    if (meData?.id) userId = String(meData.id);
  } catch (e) {
    console.warn('[ML Service] Não foi possível obter /users/me imediatamente:', e);
  }

  return await saveMlTokenToDb(
    {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      ml_user_id: userId,
      ml_nickname: nickname,
      expires_at: expiresAt
    },
    empresaId
  );
}

export async function refreshMlAccessToken(storedToken, empresaId = DEFAULT_EMPRESA_ID) {
  const { clientId, clientSecret } = getMlAppCredentials();
  if (!clientId || !clientSecret) {
    throw new Error('VITE_ML_CLIENT_ID e VITE_ML_CLIENT_SECRET são necessários para renovar o token.');
  }
  if (!storedToken?.refresh_token) {
    throw new Error('Refresh token ausente. Reconecte a conta do Mercado Livre.');
  }

  const formBody = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: storedToken.refresh_token
  }).toString();

  const tokenData = await mlProxyFetch('/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody
  });

  const expiresInSec = Number(tokenData.expires_in || 21600);
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

  return await saveMlTokenToDb(
    {
      access_token: tokenData.access_token,
      // Sempre salva o novo refresh_token retornado pelo ML (rotação de refresh_token)
      refresh_token: tokenData.refresh_token || storedToken.refresh_token,
      ml_user_id: String(tokenData.user_id || storedToken.ml_user_id || ''),
      ml_nickname: storedToken.ml_nickname || null,
      expires_at: expiresAt
    },
    empresaId
  );
}

export async function getValidMlToken(empresaId = DEFAULT_EMPRESA_ID) {
  let stored = await fetchStoredMlToken(empresaId);
  if (!stored || !stored.access_token) {
    throw new Error('Conta do Mercado Livre não conectada.');
  }

  const expiresMs = stored.expires_at ? new Date(stored.expires_at).getTime() : 0;
  const nowMs = Date.now();
  const THIRTY_MINUTES_MS = 30 * 60 * 1000;

  if (!expiresMs || expiresMs - nowMs < THIRTY_MINUTES_MS) {
    stored = await refreshMlAccessToken(stored, empresaId);
  }

  // Se ainda não tínhamos o nickname salvo, busca uma vez em /users/me
  if (!stored.ml_nickname || !stored.ml_user_id) {
    try {
      const me = await mlProxyFetch('/users/me', {
        headers: { Authorization: `Bearer ${stored.access_token}` }
      });
      if (me?.id || me?.nickname) {
        stored = await saveMlTokenToDb(
          {
            ...stored,
            ml_user_id: String(me.id || stored.ml_user_id || ''),
            ml_nickname: me.nickname || stored.ml_nickname
          },
          empresaId
        );
      }
    } catch {
      // ignore
    }
  }

  return stored;
}

export async function disconnectMlAccount(empresaId = DEFAULT_EMPRESA_ID) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(`${LOCAL_TOKEN_CACHE_KEY}_${safeEmpId}`);
  }
  try {
    await fetch(`${getSupaUrl()}/rest/v1/marketplace_tokens?platform=eq.ml`, {
      method: 'DELETE',
      headers: getSupaHeaders()
    });
  } catch (e) {
    console.warn('[ML Service] Erro ao remover token do banco:', e);
  }
}

// ============================================================================
// EXTRAÇÃO DE SKUS, FOTOS, PREÇOS E VARIAÇÕES DO MERCADO LIVRE
// ============================================================================

export function toHttpsUrl(url) {
  if (!url || typeof url !== 'string') return '';
  return url.replace(/^http:\/\//i, 'https://');
}

export function extractParentSku(item) {
  if (!item) return '';
  const fromDirect = item.seller_sku || item.seller_custom_field;
  if (fromDirect && String(fromDirect).trim()) return String(fromDirect).trim();

  if (Array.isArray(item.attributes)) {
    const skuAttr = item.attributes.find((a) => a.id === 'SELLER_SKU');
    if (skuAttr?.value_name && String(skuAttr.value_name).trim()) {
      return String(skuAttr.value_name).trim();
    }
  }
  return '';
}

export function extractVariationSku(variation, fallbackParentSku = '') {
  if (!variation) return fallbackParentSku;
  if (variation.seller_custom_field && String(variation.seller_custom_field).trim()) {
    return String(variation.seller_custom_field).trim();
  }
  if (Array.isArray(variation.attributes)) {
    const skuAttr = variation.attributes.find((a) => a.id === 'SELLER_SKU');
    if (skuAttr?.value_name && String(skuAttr.value_name).trim()) {
      return String(skuAttr.value_name).trim();
    }
  }
  return fallbackParentSku || '';
}

export function extractVariationLabel(variation) {
  if (!variation) return 'Padrão';
  const combos = Array.isArray(variation.attribute_combinations) ? variation.attribute_combinations : [];
  const label = combos
    .map((a) => a.value_name || a.name)
    .filter(Boolean)
    .join(' / ');
  return label || `Variação ${variation.id}`;
}

export function extractItemPrices(item) {
  const currentPrice = Number(item?.price || 0);
  const origPrice = Number(item?.original_price || item?.base_price || 0);

  if (origPrice > currentPrice && currentPrice > 0) {
    return {
      price: origPrice,
      price_promo: currentPrice
    };
  }
  return {
    price: currentPrice,
    price_promo: null
  };
}

// ============================================================================
// LEITURA E GRAVAÇÃO DE ANÚNCIOS (marketplace_listings)
// ============================================================================

export async function fetchStoredMlListings(empresaId = DEFAULT_EMPRESA_ID) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  try {
    const resp = await fetch(
      `${getSupaUrl()}/rest/v1/marketplace_listings?platform=eq.ml&order=title.asc`,
      { headers: getSupaHeaders() }
    );
    if (resp.ok) {
      const rows = await resp.json();
      if (typeof window !== 'undefined') {
        localStorage.setItem(`${LOCAL_LISTINGS_CACHE_KEY}_${safeEmpId}`, JSON.stringify(rows || []));
      }
      return rows || [];
    }
  } catch (e) {
    console.warn('[ML Service] Aviso ao buscar marketplace_listings:', e);
  }

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(`${LOCAL_LISTINGS_CACHE_KEY}_${safeEmpId}`);
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
  }
  return [];
}

export async function upsertMlListingsToDb(listingsArray, empresaId = DEFAULT_EMPRESA_ID) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  if (!Array.isArray(listingsArray) || listingsArray.length === 0) return [];

  if (typeof window !== 'undefined') {
    localStorage.setItem(`${LOCAL_LISTINGS_CACHE_KEY}_${safeEmpId}`, JSON.stringify(listingsArray));
  }

  try {
    const resp = await fetch(
      `${getSupaUrl()}/rest/v1/marketplace_listings?on_conflict=ml_item_id`,
      {
        method: 'POST',
        headers: {
          ...getSupaHeaders(),
          Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(listingsArray)
      }
    );
    if (resp.ok) {
      return await resp.json();
    } else {
      const errTxt = await resp.text();
      console.warn('[ML Service] Aviso no upsert de marketplace_listings:', errTxt);
    }
  } catch (e) {
    console.warn('[ML Service] Erro de rede no upsert de marketplace_listings:', e);
  }

  return listingsArray;
}

// ============================================================================
// SINCRONIZAÇÃO COMPLETA DE ANÚNCIOS E ESTOQUE DO MERCADO LIVRE
// ============================================================================

export async function syncListingsFromML(empresaId = DEFAULT_EMPRESA_ID) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  const tokenObj = await getValidMlToken(safeEmpId);
  const accessToken = tokenObj.access_token;
  const mlUserId = tokenObj.ml_user_id;

  if (!mlUserId) {
    throw new Error('ID do usuário do Mercado Livre não identificado. Reconecte a conta.');
  }

  // 1. Busca todos os IDs de anúncios (ativos e pausados) com paginação de 50 em 50
  const allItemIds = [];
  const statusesToFetch = ['active', 'paused'];

  for (const st of statusesToFetch) {
    let offset = 0;
    const limit = 50;
    while (true) {
      const searchData = await mlProxyFetch(
        `/users/${mlUserId}/items/search?status=${st}&offset=${offset}&limit=${limit}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const results = Array.isArray(searchData?.results) ? searchData.results : [];
      results.forEach((id) => {
        if (id && !allItemIds.includes(id)) {
          allItemIds.push(id);
        }
      });
      if (results.length < limit) break;
      offset += limit;
      if (offset >= 1000) break; // Limite de segurança da API sem scroll_id
    }
  }

  if (allItemIds.length === 0) {
    return { listings: [], unmappedItems: [] };
  }

  // 2. Busca detalhes em lotes de no máximo 20 IDs (limite do multiget /items do ML)
  const rawItems = [];
  const attributesList = [
    'id',
    'title',
    'price',
    'base_price',
    'original_price',
    'available_quantity',
    'thumbnail',
    'secure_thumbnail',
    'permalink',
    'status',
    'seller_sku',
    'seller_custom_field',
    'attributes',
    'shipping',
    'variations'
  ].join(',');

  for (let i = 0; i < allItemIds.length; i += 20) {
    const chunk20 = allItemIds.slice(i, i + 20).join(',');
    const multiData = await mlProxyFetch(
      `/items?ids=${encodeURIComponent(chunk20)}&attributes=${encodeURIComponent(attributesList)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (Array.isArray(multiData)) {
      multiData.forEach((entry) => {
        if (entry?.body && entry.body.id) {
          rawItems.push(entry.body);
        }
      });
    }
  }

  // 3. Busca registros atuais no Supabase para PRESERVAR vínculos FT (ft_id) e estoque físico (stock_physical)
  const existingListings = await fetchStoredMlListings(safeEmpId);
  const existingMap = new Map();
  existingListings.forEach((row) => {
    if (row?.ml_item_id) existingMap.set(String(row.ml_item_id), row);
  });

  const nowIso = new Date().toISOString();

  const formattedListings = rawItems.map((item) => {
    const mlItemId = String(item.id);
    const prevRecord = existingMap.get(mlItemId) || null;
    const prevVarsMap = new Map();
    if (Array.isArray(prevRecord?.variations)) {
      prevRecord.variations.forEach((pv) => {
        if (pv?.id !== undefined && pv?.id !== null) {
          prevVarsMap.set(String(pv.id), pv);
        }
      });
    }

    const parentSku = extractParentSku(item);
    const parentThumb = toHttpsUrl(item.secure_thumbnail || item.thumbnail || '');
    const { price, price_promo } = extractItemPrices(item);
    const logisticType = item.shipping?.logistic_type || 'default';

    const rawVars = Array.isArray(item.variations) ? item.variations : [];
    const variations = rawVars.map((v) => {
      const varIdStr = String(v.id);
      const prevVar = prevVarsMap.get(varIdStr) || null;
      const varThumb = v.picture_ids?.[0]
        ? `https://http2.mlstatic.com/D_${v.picture_ids[0]}-I.jpg`
        : parentThumb;

      return {
        id: varIdStr,
        name: extractVariationLabel(v),
        sku: extractVariationSku(v, parentSku),
        price: Number(v.price ?? item.price ?? 0),
        stock_ml: Number(v.available_quantity ?? 0),
        stock_physical: prevVar?.stock_physical !== undefined ? Number(prevVar.stock_physical) : 0,
        ft_id: prevVar?.ft_id || null,
        thumbnail_url: varThumb
      };
    });

    const totalStockMl =
      variations.length > 0
        ? variations.reduce((acc, v) => acc + Number(v.stock_ml || 0), 0)
        : Number(item.available_quantity ?? 0);

    return {
      empresa_id: safeEmpId,
      platform: 'ml',
      ml_item_id: mlItemId,
      title: item.title || 'Anúncio sem título',
      sku: parentSku,
      thumbnail_url: parentThumb,
      permalink: item.permalink || `https://produto.mercadolivre.com.br/${mlItemId.replace(/^MLB/, 'MLB-')}`,
      status: item.status || 'active',
      price,
      price_promo,
      stock_ml: totalStockMl,
      stock_physical: prevRecord?.stock_physical !== undefined ? Number(prevRecord.stock_physical) : 0,
      logistic_type: logisticType,
      variations,
      ft_id: prevRecord?.ft_id || null,
      updated_at: nowIso
    };
  });

  const savedListings = await upsertMlListingsToDb(formattedListings, safeEmpId);
  const unmappedItems = collectUnmappedTargetsFromListings(savedListings);

  return {
    listings: savedListings,
    unmappedItems
  };
}

/**
 * Identifica todos os anúncios simples ou variações que ainda não possuem FT atribuída
 * (e que não foram marcados como '__IGNORED__').
 */
export function collectUnmappedTargetsFromListings(listings = []) {
  const targets = [];

  listings.forEach((listing) => {
    const hasVars = Array.isArray(listing.variations) && listing.variations.length > 0;
    if (hasVars) {
      listing.variations.forEach((v) => {
        if (!v.ft_id) {
          targets.push({
            key: `${listing.ml_item_id}__mlvar__${v.id}`,
            ml_item_id: listing.ml_item_id,
            variation_id: String(v.id),
            title: listing.title,
            variation_name: v.name,
            sku: v.sku || listing.sku || '',
            thumbnail_url: v.thumbnail_url || listing.thumbnail_url || '',
            price: v.price || listing.price_promo || listing.price || 0,
            stock_ml: v.stock_ml ?? 0
          });
        }
      });
    } else if (!listing.ft_id) {
      targets.push({
        key: listing.ml_item_id,
        ml_item_id: listing.ml_item_id,
        variation_id: null,
        title: listing.title,
        variation_name: null,
        sku: listing.sku || '',
        thumbnail_url: listing.thumbnail_url || '',
        price: listing.price_promo || listing.price || 0,
        stock_ml: listing.stock_ml ?? 0
      });
    }
  });

  return targets;
}

// ============================================================================
// ATUALIZAÇÃO DE ESTOQUE E STATUS NO MERCADO LIVRE (COM E SEM VARIAÇÕES)
// ============================================================================

export async function updateMlListingStock({
  empresaId = DEFAULT_EMPRESA_ID,
  listing,
  newQuantity,
  variationId = null
}) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  const qty = Math.max(0, parseInt(newQuantity, 10) || 0);
  const tokenObj = await getValidMlToken(safeEmpId);
  const accessToken = tokenObj.access_token;

  const hasVariations = Array.isArray(listing.variations) && listing.variations.length > 0;
  let putBody;
  let nextVariations = listing.variations || [];
  let nextTotalStockMl = qty;

  if (hasVariations) {
    if (!variationId) {
      throw new Error('Este anúncio possui variações. Informe a variação para atualizar o estoque no Mercado Livre.');
    }
    // Regra oficial da API do ML: quando há variações, não é permitido enviar available_quantity na raiz.
    // Enviamos o array de variações preservando as quantidades das demais e atualizando a variação alvo.
    putBody = {
      variations: listing.variations.map((v) => ({
        id: Number(v.id),
        available_quantity: String(v.id) === String(variationId) ? qty : Number(v.stock_ml ?? 0)
      }))
    };

    nextVariations = listing.variations.map((v) =>
      String(v.id) === String(variationId) ? { ...v, stock_ml: qty } : v
    );
    nextTotalStockMl = nextVariations.reduce((acc, v) => acc + Number(v.stock_ml || 0), 0);
  } else {
    putBody = { available_quantity: qty };
  }

  await mlProxyFetch(`/items/${encodeURIComponent(listing.ml_item_id)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(putBody)
  });

  const updatedListing = {
    ...listing,
    stock_ml: nextTotalStockMl,
    variations: nextVariations,
    updated_at: new Date().toISOString()
  };

  await upsertMlListingsToDb([updatedListing], safeEmpId);
  return updatedListing;
}

export async function updateMlListingStatus({
  empresaId = DEFAULT_EMPRESA_ID,
  listing,
  newStatus
}) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  const tokenObj = await getValidMlToken(safeEmpId);
  const accessToken = tokenObj.access_token;

  await mlProxyFetch(`/items/${encodeURIComponent(listing.ml_item_id)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: newStatus })
  });

  const updatedListing = {
    ...listing,
    status: newStatus,
    updated_at: new Date().toISOString()
  };

  await upsertMlListingsToDb([updatedListing], safeEmpId);
  return updatedListing;
}

// ============================================================================
// BUSCA DE PEDIDOS PAGOS DO MÊS (PARA VENDAS MULTI-CANAL)
// ============================================================================

export async function fetchMlPaidOrdersForMonth({
  empresaId = DEFAULT_EMPRESA_ID,
  monthStr // formato 'YYYY-MM'
}) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  const tokenObj = await getValidMlToken(safeEmpId);
  const accessToken = tokenObj.access_token;
  const mlUserId = tokenObj.ml_user_id;

  const [yearStr, mStr] = String(monthStr || '').split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(mStr, 10);
  if (!year || !month) {
    throw new Error('Mês de referência inválido.');
  }

  const lastDay = new Date(year, month, 0).getDate();
  const fromIso = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000-03:00`;
  const toIso = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999-03:00`;

  const allOrders = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const query = new URLSearchParams({
      seller: String(mlUserId),
      'order.status': 'paid',
      'order.date_created.from': fromIso,
      'order.date_created.to': toIso,
      sort: 'date_desc',
      offset: String(offset),
      limit: String(limit)
    }).toString();

    const data = await mlProxyFetch(`/orders/search?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const results = Array.isArray(data?.results) ? data.results : [];
    allOrders.push(...results);

    if (results.length < limit) break;
    offset += limit;
    if (offset >= 1000) break;
  }

  // Agrupa os itens vendidos por (ml_item_id, variation_id)
  const soldItemsMap = new Map();

  allOrders.forEach((order) => {
    if (order.status === 'cancelled') return;
    const orderItems = Array.isArray(order.order_items) ? order.order_items : [];

    orderItems.forEach((oi) => {
      const itemObj = oi.item || {};
      const mlItemId = String(itemObj.id || '');
      if (!mlItemId) return;

      const varId = itemObj.variation_id ? String(itemObj.variation_id) : null;
      const key = varId ? `${mlItemId}__mlvar__${varId}` : mlItemId;
      const qty = Number(oi.quantity || 0);
      if (qty <= 0) return;

      const sku = String(itemObj.seller_sku || itemObj.seller_custom_field || '').trim();
      const varAttrs = Array.isArray(itemObj.variation_attributes)
        ? itemObj.variation_attributes.map((a) => a.value_name || a.name).filter(Boolean).join(' / ')
        : null;

      const unitPrice = Number(oi.unit_price || 0);
      const existing = soldItemsMap.get(key);
      if (existing) {
        existing.quantitySold += qty;
        existing.totalRevenue += qty * unitPrice;
        existing.unit_price = Number((existing.totalRevenue / existing.quantitySold).toFixed(2));
        existing.ordersCount += 1;
      } else {
        soldItemsMap.set(key, {
          key,
          ml_item_id: mlItemId,
          variation_id: varId,
          title: itemObj.title || 'Item vendido no ML',
          variation_name: varAttrs,
          sku,
          unit_price: unitPrice,
          totalRevenue: qty * unitPrice,
          quantitySold: qty,
          ordersCount: 1
        });
      }
    });
  });

  // Cruza com marketplace_listings para descobrir o vínculo FT de cada item vendido
  let storedListings = await fetchStoredMlListings(safeEmpId);
  if (storedListings.length === 0 && soldItemsMap.size > 0) {
    // Se ainda não sincronizou anúncios nenhuma vez, sincroniza automaticamente
    try {
      const syncRes = await syncListingsFromML(safeEmpId);
      storedListings = syncRes.listings || [];
    } catch (e) {
      console.warn('[ML Service] Aviso ao sincronizar anúncios durante busca de pedidos:', e);
    }
  }

  const listingsById = new Map();
  storedListings.forEach((l) => listingsById.set(String(l.ml_item_id), l));

  const soldItemsList = Array.from(soldItemsMap.values()).map((sold) => {
    const listing = listingsById.get(sold.ml_item_id);
    let ftLink = null;
    let thumb = listing?.thumbnail_url || '';
    let resolvedSku = sold.sku || listing?.sku || '';

    if (listing) {
      if (sold.variation_id && Array.isArray(listing.variations)) {
        const matchedVar = listing.variations.find((v) => String(v.id) === String(sold.variation_id));
        if (matchedVar) {
          ftLink = matchedVar.ft_id || listing.ft_id || null;
          thumb = matchedVar.thumbnail_url || thumb;
          resolvedSku = sold.sku || matchedVar.sku || resolvedSku;
        } else {
          ftLink = listing.ft_id || null;
        }
      } else {
        ftLink = listing.ft_id || null;
      }
    }

    return {
      ...sold,
      sku: resolvedSku,
      thumbnail_url: thumb,
      ft_id: ftLink
    };
  });

  const unmappedSoldItems = soldItemsList.filter((item) => !item.ft_id);

  const salesByFtTarget = {};
  const revenueByFtTarget = {};
  soldItemsList.forEach((item) => {
    if (item.ft_id && item.ft_id !== '__IGNORED__') {
      const q = Number(item.quantitySold || 0);
      const rev = Number(item.totalRevenue ?? q * Number(item.unit_price || 0));
      salesByFtTarget[item.ft_id] = (salesByFtTarget[item.ft_id] || 0) + q;
      revenueByFtTarget[item.ft_id] = (revenueByFtTarget[item.ft_id] || 0) + rev;
    }
  });

  const paidCount = allOrders.filter((o) => o.status !== 'cancelled').length;

  return {
    totalOrdersPaid: paidCount,
    totalOrdersCount: paidCount,
    salesByFtTarget,
    revenueByFtTarget,
    soldItems: soldItemsList,
    unmappedSoldItems,
    listings: storedListings
  };
}

// ============================================================================
// UTILITÁRIOS DE VÍNCULO FT / VARIAÇÃO FT E PROPAGAÇÃO AUTOMÁTICA DE SKU
// ============================================================================

export function parseFtTargetKey(ftTargetKey) {
  if (!ftTargetKey || ftTargetKey === '__IGNORED__') {
    return { ftId: null, varId: null, isIgnored: ftTargetKey === '__IGNORED__' };
  }
  const str = String(ftTargetKey);
  if (str.includes('__var__')) {
    const [ftId, varId] = str.split('__var__');
    return { ftId, varId, isIgnored: false };
  }
  return { ftId: str, varId: null, isIgnored: false };
}

export function buildFtCatalogOptions(ftsList = []) {
  const options = [];

  ftsList.forEach((ft) => {
    const ftId = ft.id || ft.indiceFt;
    const nome = ft.nome || ft.nomePeca || ft.rawData?.nomePeca || 'Sem nome';
    const baseSku = ft.sku || ft.rawData?.sku || '';
    const variacoes = ft.variacoes || ft.variacoesEstoque || ft.rawData?.variacoesEstoque || [];

    if (Array.isArray(variacoes) && variacoes.length > 0) {
      // Permite vincular a uma variação específica da FT ou à FT geral
      variacoes.forEach((v) => {
        options.push({
          value: `${ftId}__var__${v.id}`,
          ftId,
          varId: v.id,
          varNome: v.nome,
          sku: v.sku || baseSku || '',
          label: `${ftId} - ${v.nome} (${nome})${v.sku ? ` [SKU: ${v.sku}]` : ''}`
        });
      });
      options.push({
        value: ftId,
        ftId,
        varId: null,
        varNome: null,
        sku: baseSku,
        label: `${ftId} — ${nome} (FT Geral)${baseSku ? ` [SKU: ${baseSku}]` : ''}`
      });
    } else {
      options.push({
        value: ftId,
        ftId,
        varId: null,
        varNome: null,
        sku: baseSku,
        label: `${ftId} — ${nome}${baseSku ? ` [SKU: ${baseSku}]` : ''}`
      });
    }
  });

  return options;
}

export function formatFtLinkBadge(ftTargetKey, ftsList = []) {
  if (!ftTargetKey) return null;
  if (ftTargetKey === '__IGNORED__') return 'Ignorado';

  const { ftId, varId } = parseFtTargetKey(ftTargetKey);
  const foundFt = ftsList.find((f) => (f.id || f.indiceFt) === ftId);
  if (!foundFt) return ftTargetKey;

  const nome = foundFt.nome || foundFt.nomePeca || foundFt.rawData?.nomePeca || '';
  const variacoes = foundFt.variacoes || foundFt.variacoesEstoque || foundFt.rawData?.variacoesEstoque || [];
  if (varId && Array.isArray(variacoes)) {
    const foundVar = variacoes.find((v) => v.id === varId);
    if (foundVar) {
      return `${ftId} - ${foundVar.nome}`;
    }
  }
  return `${ftId} — ${nome}`;
}

/**
 * Salva os vínculos escolhidos pelo usuário em `marketplace_listings`
 * e, quando aplicável, preenche automaticamente o SKU na FT / Variação e em `ecommerce_overrides`.
 */
export async function saveFtMappingsAndPropagateSku({
  empresaId = DEFAULT_EMPRESA_ID,
  mappingsByKey = {}, // { 'MLB123': 'FT-16', 'MLB456__mlvar__999': 'FT-01__var__v_1' }
  skuByKey = {},      // { 'MLB123': 'SKU-PORTA-BATOM', ... }
  propagateSku = true
}) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  const currentListings = await fetchStoredMlListings(safeEmpId);
  const listingsMap = new Map();
  currentListings.forEach((l) => listingsMap.set(String(l.ml_item_id), { ...l }));

  const ftsToUpdateSku = new Map(); // ftId -> { baseSku, varSkus: { varId: sku } }

  Object.entries(mappingsByKey).forEach(([targetKey, chosenFtKey]) => {
    if (!chosenFtKey) return;

    let mlItemId = targetKey;
    let variationId = null;
    if (targetKey.includes('__mlvar__')) {
      const parts = targetKey.split('__mlvar__');
      mlItemId = parts[0];
      variationId = parts[1];
    }

    const listing = listingsMap.get(String(mlItemId));
    if (listing) {
      if (variationId && Array.isArray(listing.variations) && listing.variations.length > 0) {
        listing.variations = listing.variations.map((v) =>
          String(v.id) === String(variationId)
            ? { ...v, ft_id: chosenFtKey, ...(skuByKey[targetKey] ? { sku: skuByKey[targetKey] } : {}) }
            : v
        );
      } else {
        listing.ft_id = chosenFtKey;
        if (skuByKey[targetKey]) {
          listing.sku = skuByKey[targetKey];
        }
      }
      listing.updated_at = new Date().toISOString();
      listingsMap.set(String(mlItemId), listing);
    } else {
      listingsMap.set(String(mlItemId), {
        empresa_id: safeEmpId,
        platform: 'ml',
        ml_item_id: String(mlItemId),
        sku: skuByKey[targetKey] || '',
        ft_id: variationId ? null : chosenFtKey,
        variations: variationId
          ? [{ id: String(variationId), sku: skuByKey[targetKey] || '', ft_id: chosenFtKey }]
          : [],
        updated_at: new Date().toISOString()
      });
    }

    // Registra SKU para propagar para a FT e para o canal ML
    const parsed = parseFtTargetKey(chosenFtKey);
    if (!parsed.isIgnored && parsed.ftId) {
      const itemSku = String(
        skuByKey[targetKey] ||
          (variationId
            ? listing?.variations?.find((v) => String(v.id) === String(variationId))?.sku
            : listing?.sku) ||
          ''
      ).trim();

      const mlEffectivePrice = Number(
        (variationId
          ? listing?.variations?.find((v) => String(v.id) === String(variationId))?.price
          : null) ||
          listing?.price_promo ||
          listing?.price ||
          0
      );

      if (propagateSku && itemSku) {
        const entry = ftsToUpdateSku.get(parsed.ftId) || { baseSku: null, varSkus: {}, mlPrice: 0 };
        if (parsed.varId) {
          entry.varSkus[parsed.varId] = itemSku;
        } else {
          entry.baseSku = itemSku;
        }
        if (mlEffectivePrice > 0) entry.mlPrice = mlEffectivePrice;
        ftsToUpdateSku.set(parsed.ftId, entry);
      } else {
        // Mesmo sem SKU novo, garante registro da FT para marcar cadastrado = true no canal ML
        const entry = ftsToUpdateSku.get(parsed.ftId) || { baseSku: null, varSkus: {}, mlPrice: 0 };
        if (mlEffectivePrice > 0) entry.mlPrice = mlEffectivePrice;
        ftsToUpdateSku.set(parsed.ftId, entry);
      }
    }
  });

  const updatedListings = await upsertMlListingsToDb(Array.from(listingsMap.values()), safeEmpId);

  // Propaga SKU e flag 'cadastrado: true' para fichas_tecnicas e ecommerce_overrides
  for (const [ftId, skuChanges] of ftsToUpdateSku.entries()) {
    try {
      // 1. Atualiza fichas_tecnicas.data com o SKU se houver
      if (skuChanges.baseSku || Object.keys(skuChanges.varSkus).length > 0) {
        const ftResp = await fetch(
          `${getSupaUrl()}/rest/v1/fichas_tecnicas?id=eq.${encodeURIComponent(ftId)}&select=id,data`,
          { headers: getSupaHeaders() }
        );
        if (ftResp.ok) {
          const rows = await ftResp.json();
          if (rows?.[0]) {
            const curData = rows[0].data || {};
            const nextData = { ...curData };
            if (skuChanges.baseSku && !nextData.sku) {
              nextData.sku = skuChanges.baseSku;
            }
            if (Array.isArray(nextData.variacoesEstoque) && Object.keys(skuChanges.varSkus).length > 0) {
              nextData.variacoesEstoque = nextData.variacoesEstoque.map((v) =>
                skuChanges.varSkus[v.id] ? { ...v, sku: skuChanges.varSkus[v.id] } : v
              );
              if (!nextData.sku) {
                const firstVarSku = Object.values(skuChanges.varSkus)[0];
                if (firstVarSku) nextData.sku = firstVarSku;
              }
            }
            await fetch(`${getSupaUrl()}/rest/v1/fichas_tecnicas?id=eq.${encodeURIComponent(ftId)}`, {
              method: 'PATCH',
              headers: { ...getSupaHeaders(), Prefer: 'return=minimal' },
              body: JSON.stringify({ data: nextData })
            });
          }
        }
      }

      // 2. Marca cadastrado = true e salva SKU no ecommerce_overrides do canal 'ml'
      const ovResp = await fetch(
        `${getSupaUrl()}/rest/v1/ecommerce_overrides?channel_id=eq.ml&ft_id=eq.${encodeURIComponent(ftId)}&select=*`,
        { headers: getSupaHeaders() }
      );
      let curSettings = {};
      if (ovResp.ok) {
        const ovRows = await ovResp.json();
        if (ovRows?.[0]?.settings) curSettings = ovRows[0].settings;
      }
      const nextSettings = {
        ...curSettings,
        cadastrado: true,
        ...(skuChanges.baseSku ? { sku: skuChanges.baseSku } : {}),
        ...(skuChanges.mlPrice > 0 && !curSettings.precoRealVenda
          ? { precoRealVenda: String(skuChanges.mlPrice.toFixed(2)) }
          : {})
      };
      await fetch(`${getSupaUrl()}/rest/v1/ecommerce_overrides?on_conflict=channel_id,ft_id`, {
        method: 'POST',
        headers: { ...getSupaHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          channel_id: 'ml',
          ft_id: ftId,
          settings: nextSettings
        })
      });
    } catch (e) {
      console.warn(`[ML Service] Aviso ao propagar SKU para ${ftId}:`, e);
    }
  }

  return updatedListings;
}
