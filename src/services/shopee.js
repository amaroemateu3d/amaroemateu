// ============================================================================
// SERVIÇO DE INTEGRAÇÃO COM A SHOPEE OPEN PLATFORM API v2 (AM3D Soluções)
// ============================================================================

const SHOPEE_LIVE_API_BASE = 'https://partner.shopeemobile.com';
const SHOPEE_TEST_API_BASE = 'https://partner.test-stable.shopeemobile.com';
const DEFAULT_EMPRESA_ID = 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9';

const LOCAL_TOKEN_CACHE_KEY = 'am3d_shopee_token_cache';
const LOCAL_LISTINGS_CACHE_KEY = 'am3d_shopee_listings_cache';
const LOCAL_APP_CONFIG_KEY = 'am3d_shopee_app_credentials';

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

// ============================================================================
// ASSINATURA HMAC-SHA256 (Web Crypto nativo - zero dependências)
// ============================================================================

export async function computeHmacSha256Hex(key, message) {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    return '';
  }
  const enc = new TextEncoder();
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(String(key || '').trim()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await window.crypto.subtle.sign('HMAC', cryptoKey, enc.encode(String(message || '')));
  return Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================================================
// CREDENCIAIS DO APP SHOPEE (Armazenadas no localStorage / .env)
// ============================================================================

export function getShopeeAppCredentials() {
  let savedCustom = {};
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_APP_CONFIG_KEY);
      if (raw) savedCustom = JSON.parse(raw) || {};
    } catch {
      // ignore
    }
  }

  const defaultRedirect = typeof window !== 'undefined'
    ? `${window.location.origin}/estoque`
    : 'https://amaroemateu.vercel.app/estoque';

  return {
    partnerId: String(savedCustom.partnerId || import.meta.env.VITE_SHOPEE_PARTNER_ID || '1252796').trim(),
    partnerKey: String(savedCustom.partnerKey || import.meta.env.VITE_SHOPEE_PARTNER_KEY || 'shpk754946676e536d744c686f6a6c45586d41776646716b6c416e4857417743').trim(),
    redirectUri: String(savedCustom.redirectUri || import.meta.env.VITE_SHOPEE_REDIRECT_URI || defaultRedirect).trim(),
    isTest: savedCustom.isTest !== undefined
      ? Boolean(savedCustom.isTest)
      : (import.meta.env.VITE_SHOPEE_IS_TEST === 'true')
  };
}

export function saveShopeeAppCredentialsLocal({ partnerId, partnerKey, redirectUri, isTest }) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    LOCAL_APP_CONFIG_KEY,
    JSON.stringify({
      partnerId: String(partnerId || '').trim(),
      partnerKey: String(partnerKey || '').trim(),
      redirectUri: String(redirectUri || '').trim(),
      isTest: Boolean(isTest)
    })
  );
}

// ============================================================================
// GERAÇÃO DA URL DE AUTORIZAÇÃO DA SHOPEE (API v2)
// ============================================================================

export async function getShopeeAuthUrl() {
  const { partnerId, partnerKey, redirectUri, isTest } = getShopeeAppCredentials();
  if (!partnerId) {
    throw new Error('VITE_SHOPEE_PARTNER_ID não configurado. Insira o Partner ID da Shopee.');
  }
  if (!partnerKey) {
    throw new Error('VITE_SHOPEE_PARTNER_KEY não configurado. Insira o Partner Key da Shopee.');
  }
  if (!redirectUri) {
    throw new Error('Redirect URI não configurado para a Shopee.');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const path = '/api/v2/shop/auth_partner';
  const baseString = `${partnerId}${path}${timestamp}`;
  const sign = await computeHmacSha256Hex(partnerKey, baseString);

  const host = isTest ? 'partner.test-stable.shopeemobile.com' : 'partner.shopeemobile.com';
  return `https://${host}${path}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirectUri)}`;
}

// ============================================================================
// EXTRAÇÃO DE CODE E SHOP_ID DO REDIRECT OU INPUT DO USUÁRIO
// ============================================================================

export function extractShopeeCodeAndShopId(inputStr) {
  const trimmed = String(inputStr || '').trim();
  if (!trimmed) return { code: null, shopId: null };

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        code: parsed.code ? String(parsed.code).trim() : null,
        shopId: parsed.shop_id || parsed.shopId ? String(parsed.shop_id || parsed.shopId).trim() : null
      };
    } catch {
      // ignore
    }
  }

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://dummy.local/${trimmed.startsWith('?') ? trimmed : `?${trimmed}`}`);
    const code = url.searchParams.get('code');
    const shopId = url.searchParams.get('shop_id');
    if (code || shopId) {
      return {
        code: code ? code.trim() : null,
        shopId: shopId ? shopId.trim() : null
      };
    }
  } catch {
    // regex fallback
  }

  const codeMatch = trimmed.match(/[?&]code=([^&#\s]+)/i);
  const shopIdMatch = trimmed.match(/[?&]shop_id=([^&#\s]+)/i);

  return {
    code: codeMatch ? decodeURIComponent(codeMatch[1]).trim() : trimmed,
    shopId: shopIdMatch ? decodeURIComponent(shopIdMatch[1]).trim() : null
  };
}

// ============================================================================
// CLIENTE HTTP VIA SERVIDOR PROXY (/api/shopeeproxy)
// ============================================================================

export async function shopeeProxyFetch(apiPath, options = {}) {
  const { partnerId, partnerKey, isTest } = getShopeeAppCredentials();
  const cleanPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;

  const queryParams = new URLSearchParams();
  queryParams.set('path', cleanPath);
  if (partnerId) queryParams.set('partner_id', partnerId);
  if (partnerKey) queryParams.set('partner_key', partnerKey);
  if (isTest) queryParams.set('is_test', 'true');

  if (options.token) queryParams.set('access_token', options.token);
  if (options.shopId) queryParams.set('shop_id', String(options.shopId));

  if (options.query && typeof options.query === 'object') {
    Object.entries(options.query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) {
          v.forEach((item) => queryParams.append(k, String(item)));
        } else {
          queryParams.set(k, String(v));
        }
      }
    });
  }

  const proxyUrl = `/api/shopeeproxy?${queryParams.toString()}`;

  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  };

  if (options.body && options.method && options.method !== 'GET' && options.method !== 'HEAD') {
    fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const resp = await fetch(proxyUrl, fetchOptions);
  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!resp.ok || (data && (data.error && data.error !== ''))) {
    const errorMsg = data?.message || data?.error || data?.msg || `Erro HTTP ${resp.status} na API Shopee`;
    const err = new Error(errorMsg);
    err.status = resp.status;
    err.shopeeData = data;
    throw err;
  }

  return data;
}

// ============================================================================
// GERENCIAMENTO DE TOKENS NO SUPABASE (COM AUTO-REFRESH DE 30 MINUTOS)
// ============================================================================

export async function fetchStoredShopeeToken(empresaId = DEFAULT_EMPRESA_ID) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  try {
    const resp = await fetch(
      `${getSupaUrl()}/rest/v1/marketplace_tokens?platform=eq.shopee&order=updated_at.desc&limit=1`,
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
    console.warn('[Shopee Service] Aviso ao ler marketplace_tokens do Supabase:', e);
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

export async function saveShopeeTokenToDb(tokenPayload, empresaId = DEFAULT_EMPRESA_ID) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  const nowIso = new Date().toISOString();

  const record = {
    empresa_id: safeEmpId,
    platform: 'shopee',
    access_token: tokenPayload.access_token,
    refresh_token: tokenPayload.refresh_token,
    ml_user_id: String(tokenPayload.shop_id || tokenPayload.ml_user_id || ''),
    ml_nickname: tokenPayload.shop_name || tokenPayload.ml_nickname || 'Loja Shopee',
    expires_at: tokenPayload.expires_at,
    updated_at: nowIso
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(`${LOCAL_TOKEN_CACHE_KEY}_${safeEmpId}`, JSON.stringify(record));
  }

  try {
    const existing = await fetch(
      `${getSupaUrl()}/rest/v1/marketplace_tokens?platform=eq.shopee&select=id`,
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
    console.warn('[Shopee Service] Aviso ao gravar token no Supabase (mantido cache local):', e);
  }

  return record;
}

export async function exchangeShopeeCodeForToken({ code, shopId }, empresaId = DEFAULT_EMPRESA_ID) {
  if (!code) {
    throw new Error('Código de autorização Shopee (?code=...) não informado.');
  }
  if (!shopId) {
    throw new Error('Shop ID da Shopee (?shop_id=...) não informado.');
  }

  const { partnerId } = getShopeeAppCredentials();

  const bodyPayload = {
    code: String(code).trim(),
    partner_id: Number(partnerId),
    shop_id: Number(shopId)
  };

  const tokenData = await shopeeProxyFetch('/api/v2/auth/token/get', {
    method: 'POST',
    body: bodyPayload
  });

  const expiresInSec = Number(tokenData.expire_in || 14400); // 4 horas por padrão
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

  let shopName = `Shopee Loja ${shopId}`;
  try {
    const shopInfo = await shopeeProxyFetch('/api/v2/shop/get_shop_info', {
      method: 'GET',
      token: tokenData.access_token,
      shopId: String(shopId)
    });
    if (shopInfo?.response?.shop_name) {
      shopName = shopInfo.response.shop_name;
    }
  } catch (e) {
    console.warn('[Shopee Service] Aviso ao buscar shop_info:', e);
  }

  return await saveShopeeTokenToDb(
    {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      shop_id: String(shopId),
      shop_name: shopName,
      expires_at: expiresAt
    },
    empresaId
  );
}

export async function refreshShopeeAccessToken(storedToken, empresaId = DEFAULT_EMPRESA_ID) {
  const { partnerId } = getShopeeAppCredentials();
  if (!storedToken?.refresh_token) {
    throw new Error('Refresh token da Shopee ausente. Reconecte a conta da Shopee.');
  }

  const shopId = storedToken.ml_user_id;
  const bodyPayload = {
    refresh_token: storedToken.refresh_token,
    partner_id: Number(partnerId),
    shop_id: Number(shopId)
  };

  const tokenData = await shopeeProxyFetch('/api/v2/auth/access_token/get', {
    method: 'POST',
    body: bodyPayload
  });

  const expiresInSec = Number(tokenData.expire_in || 14400);
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

  return await saveShopeeTokenToDb(
    {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || storedToken.refresh_token,
      shop_id: shopId,
      shop_name: storedToken.ml_nickname,
      expires_at: expiresAt
    },
    empresaId
  );
}

export async function getValidShopeeToken(empresaId = DEFAULT_EMPRESA_ID) {
  let stored = await fetchStoredShopeeToken(empresaId);
  if (!stored || !stored.access_token) {
    throw new Error('Conta da Shopee não conectada. Conecte sua loja Shopee no botão acima.');
  }

  const expiresMs = stored.expires_at ? new Date(stored.expires_at).getTime() : 0;
  const nowMs = Date.now();
  const THIRTY_MINUTES_MS = 30 * 60 * 1000;

  if (!expiresMs || expiresMs - nowMs < THIRTY_MINUTES_MS) {
    stored = await refreshShopeeAccessToken(stored, empresaId);
  }

  return stored;
}

export async function disconnectShopeeAccount(empresaId = DEFAULT_EMPRESA_ID) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(`${LOCAL_TOKEN_CACHE_KEY}_${safeEmpId}`);
  }
  try {
    await fetch(`${getSupaUrl()}/rest/v1/marketplace_tokens?platform=eq.shopee`, {
      method: 'DELETE',
      headers: getSupaHeaders()
    });
  } catch (e) {
    console.warn('[Shopee Service] Erro ao remover token da Shopee no banco:', e);
  }
}

// ============================================================================
// LEITURA E GRAVAÇÃO DE ANÚNCIOS (marketplace_listings com platform='shopee')
// ============================================================================

export async function fetchStoredShopeeListings(empresaId = DEFAULT_EMPRESA_ID) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  try {
    const resp = await fetch(
      `${getSupaUrl()}/rest/v1/marketplace_listings?platform=eq.shopee&order=title.asc`,
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
    console.warn('[Shopee Service] Aviso ao buscar marketplace_listings:', e);
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

export async function upsertShopeeListingsToDb(listingsArray, empresaId = DEFAULT_EMPRESA_ID) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  if (!Array.isArray(listingsArray) || listingsArray.length === 0) return [];

  if (typeof window !== 'undefined') {
    localStorage.setItem(`${LOCAL_LISTINGS_CACHE_KEY}_${safeEmpId}`, JSON.stringify(listingsArray));
  }

  try {
    const resp = await fetch(
      `${getSupaUrl()}/rest/v1/marketplace_listings?on_conflict=platform,ml_item_id`,
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
      console.warn('[Shopee Service] Aviso no upsert de marketplace_listings (Shopee):', errTxt);
    }
  } catch (e) {
    console.warn('[Shopee Service] Erro de rede no upsert de marketplace_listings (Shopee):', e);
  }

  return listingsArray;
}

// ============================================================================
// EXTRAÇÃO E SINCRONIZAÇÃO DE ANÚNCIOS SHOPEE
// ============================================================================

export function extractFtIdFromShopeeSku(sku) {
  if (!sku || typeof sku !== 'string') return null;
  const clean = sku.trim().toUpperCase();
  const match = clean.match(/\b(FT[-_\s]?\d{1,4}[A-Z]?)\b/i);
  if (match) {
    return match[1].replace(/[-_\s]+/g, '-').toUpperCase();
  }
  return null;
}

export async function syncListingsFromShopee(empresaId = DEFAULT_EMPRESA_ID) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  const tokenObj = await getValidShopeeToken(safeEmpId);
  const token = tokenObj.access_token;
  const shopId = tokenObj.ml_user_id;

  const existingListings = await fetchStoredShopeeListings(safeEmpId);
  const existingMap = new Map();
  existingListings.forEach((item) => {
    if (item.ml_item_id) {
      existingMap.set(String(item.ml_item_id), item);
    }
  });

  // 1. Busca todos os IDs de itens (NORMAL e UNLIST)
  const allItemIds = [];
  const statuses = ['NORMAL', 'UNLIST'];

  for (const st of statuses) {
    let offset = 0;
    const pageSize = 50;
    while (true) {
      const data = await shopeeProxyFetch('/api/v2/product/get_item_list', {
        method: 'GET',
        token,
        shopId,
        query: {
          item_status: st,
          offset,
          page_size: pageSize
        }
      });

      const items = Array.isArray(data?.response?.item) ? data.response.item : [];
      items.forEach((it) => {
        if (it?.item_id && !allItemIds.includes(it.item_id)) {
          allItemIds.push(it.item_id);
        }
      });

      if (!data?.response?.has_next_page || items.length === 0) {
        break;
      }
      offset = data.response.next_offset || offset + pageSize;
      if (offset >= 1000) break;
    }
  }

  if (allItemIds.length === 0) {
    return { listings: [], unmappedItems: [] };
  }

  // 2. Busca detalhes básicos em lotes de até 50 itens
  const rawItems = [];
  for (let i = 0; i < allItemIds.length; i += 50) {
    const chunk50 = allItemIds.slice(i, i + 50).join(',');
    const detailsData = await shopeeProxyFetch('/api/v2/product/get_item_base_info', {
      method: 'GET',
      token,
      shopId,
      query: { item_id_list: chunk50 }
    });
    const list = Array.isArray(detailsData?.response?.item_list) ? detailsData.response.item_list : [];
    rawItems.push(...list);
  }

  // 3. Monta os objetos de anúncio padronizados
  const nowIso = new Date().toISOString();
  const listingsToSave = [];
  const unmappedItems = [];

  for (const item of rawItems) {
    const itemIdStr = String(item.item_id);
    const existing = existingMap.get(itemIdStr) || {};

    const priceObj = Array.isArray(item.price_info_with_currency) && item.price_info_with_currency.length > 0
      ? item.price_info_with_currency[0]
      : null;
    const origPrice = priceObj ? Number(priceObj.original_price || 0) : 0;
    const currentPrice = priceObj ? Number(priceObj.current_price || origPrice) : 0;

    const parentSku = String(item.item_sku || '').trim();
    const thumbnail = Array.isArray(item.image?.image_url_list) && item.image.image_url_list.length > 0
      ? item.image.image_url_list[0]
      : '';

    let stockShopee = 0;
    if (item.stock_info_v2?.summary_info?.total_available_stock !== undefined) {
      stockShopee = Number(item.stock_info_v2.summary_info.total_available_stock);
    }

    let variations = [];
    if (item.has_model) {
      try {
        const modelData = await shopeeProxyFetch('/api/v2/product/get_model_list', {
          method: 'GET',
          token,
          shopId,
          query: { item_id: item.item_id }
        });

        const models = Array.isArray(modelData?.response?.model) ? modelData.response.model : [];
        const existingVarsMap = new Map();
        if (Array.isArray(existing.variations)) {
          existing.variations.forEach((v) => {
            if (v.id) existingVarsMap.set(String(v.id), v);
          });
        }

        variations = models.map((m) => {
          const mIdStr = String(m.model_id);
          const prevVar = existingVarsMap.get(mIdStr) || {};
          const mSku = String(m.model_sku || parentSku).trim();
          const mPriceInfo = Array.isArray(m.price_info) && m.price_info[0] ? m.price_info[0] : {};
          const mOrig = Number(mPriceInfo.original_price || origPrice);
          const mCur = Number(mPriceInfo.current_price || mOrig);
          const mStock = Number(m.stock_info_v2?.summary_info?.total_available_stock ?? 0);

          const autoFtVar = prevVar.ft_id || extractFtIdFromShopeeSku(mSku);

          return {
            id: mIdStr,
            model_id: m.model_id,
            sku: mSku,
            label: m.model_name || `Variação ${m.model_id}`,
            name: m.model_name || `Variação ${m.model_id}`,
            price: mOrig > mCur && mCur > 0 ? mOrig : mCur,
            price_promo: mOrig > mCur && mCur > 0 ? mCur : null,
            stock_ml: mStock,
            ft_id: autoFtVar || null,
            ft_variation_id: prevVar.ft_variation_id || null
          };
        });
      } catch (err) {
        console.warn(`[Shopee Service] Erro ao buscar variações do item ${item.item_id}:`, err);
      }
    }

    let ftId = existing.ft_id || null;
    if (!ftId && parentSku) {
      ftId = extractFtIdFromShopeeSku(parentSku);
    }
    if (!ftId && variations.length > 0) {
      const firstWithFt = variations.find((v) => v.ft_id);
      if (firstWithFt) ftId = firstWithFt.ft_id;
    }

    const listingRecord = {
      empresa_id: safeEmpId,
      platform: 'shopee',
      ml_item_id: itemIdStr,
      title: item.item_name || 'Anúncio Shopee',
      sku: parentSku || (variations[0]?.sku || ''),
      thumbnail_url: thumbnail,
      permalink: `https://shopee.com.br/product/${shopId}/${item.item_id}`,
      status: item.item_status === 'NORMAL' ? 'active' : 'paused',
      price: origPrice > currentPrice && currentPrice > 0 ? origPrice : currentPrice,
      price_promo: origPrice > currentPrice && currentPrice > 0 ? currentPrice : null,
      stock_ml: stockShopee,
      stock_physical: existing.stock_physical || null,
      logistic_type: 'shopee_standard',
      variations: variations.length > 0 ? variations : null,
      ft_id: ftId || null,
      updated_at: nowIso
    };

    listingsToSave.push(listingRecord);

    if (!listingRecord.ft_id && (!variations.length || variations.some((v) => !v.ft_id))) {
      unmappedItems.push({
        id: itemIdStr,
        title: listingRecord.title,
        sku: listingRecord.sku,
        variations: variations.filter((v) => !v.ft_id)
      });
    }
  }

  const savedListings = await upsertShopeeListingsToDb(listingsToSave, safeEmpId);
  return { listings: savedListings, unmappedItems };
}

// ============================================================================
// ATUALIZAÇÃO MANUAL OU EM MASSA DE ESTOQUE NA SHOPEE
// ============================================================================

export async function updateShopeeStock({ itemId, modelId = 0, availableQuantity }, empresaId = DEFAULT_EMPRESA_ID) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  const tokenObj = await getValidShopeeToken(safeEmpId);
  const token = tokenObj.access_token;
  const shopId = tokenObj.ml_user_id;

  const numericQty = Math.max(0, parseInt(availableQuantity, 10) || 0);

  const bodyPayload = {
    item_id: Number(itemId),
    stock_list: [
      {
        model_id: Number(modelId || 0),
        normal_stock: numericQty
      }
    ]
  };

  const updateResult = await shopeeProxyFetch('/api/v2/product/update_stock', {
    method: 'POST',
    token,
    shopId,
    body: bodyPayload
  });

  const currentListings = await fetchStoredShopeeListings(safeEmpId);
  const updatedListings = currentListings.map((item) => {
    if (String(item.ml_item_id) === String(itemId)) {
      if (modelId && Array.isArray(item.variations)) {
        const nextVars = item.variations.map((v) => {
          if (String(v.id || v.model_id) === String(modelId)) {
            return { ...v, stock_ml: numericQty };
          }
          return v;
        });
        const total = nextVars.reduce((sum, v) => sum + (Number(v.stock_ml) || 0), 0);
        return { ...item, stock_ml: total, variations: nextVars, updated_at: new Date().toISOString() };
      }
      return { ...item, stock_ml: numericQty, updated_at: new Date().toISOString() };
    }
    return item;
  });

  await upsertShopeeListingsToDb(updatedListings, safeEmpId);
  return updateResult;
}

// ============================================================================
// ATUALIZAÇÃO DE STATUS DO ANÚNCIO (ATIVAR / PAUSAR NA SHOPEE)
// ============================================================================

export async function updateShopeeListingStatus({ itemId, status }, empresaId = DEFAULT_EMPRESA_ID) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  const tokenObj = await getValidShopeeToken(safeEmpId);
  const token = tokenObj.access_token;
  const shopId = tokenObj.ml_user_id;

  const isUnlist = status === 'paused' || status === 'UNLIST';
  const bodyPayload = {
    item_id_list: [Number(itemId)],
    unlist: isUnlist
  };

  try {
    await shopeeProxyFetch('/api/v2/product/unlist_item', {
      method: 'POST',
      token,
      shopId,
      body: bodyPayload
    });
  } catch (e) {
    console.warn('[Shopee Service] Erro ao alternar status do anúncio:', e);
    throw e;
  }

  const currentListings = await fetchStoredShopeeListings(safeEmpId);
  const updatedListings = currentListings.map((item) => {
    if (String(item.ml_item_id) === String(itemId)) {
      return { ...item, status: isUnlist ? 'paused' : 'active', updated_at: new Date().toISOString() };
    }
    return item;
  });

  await upsertShopeeListingsToDb(updatedListings, safeEmpId);
  return { success: true };
}

// ============================================================================
// COLETA DE ITENS NÃO MAPEADOS PARA O MODAL
// ============================================================================

export function collectUnmappedTargetsFromShopeeListings(listings = []) {
  const unmapped = [];

  listings.forEach((listing) => {
    const hasVars = Array.isArray(listing.variations) && listing.variations.length > 0;
    if (hasVars) {
      listing.variations.forEach((v) => {
        if (!v.ft_id || v.ft_id === '') {
          unmapped.push({
            key: `${listing.ml_item_id}__mlvar__${v.id}`,
            ml_item_id: listing.ml_item_id,
            variation_id: String(v.id),
            title: listing.title,
            variation_name: v.label || v.name || `Variação ${v.id}`,
            sku: v.sku || listing.sku || '',
            thumbnail_url: listing.thumbnail_url || ''
          });
        }
      });
    } else {
      if (!listing.ft_id || listing.ft_id === '') {
        unmapped.push({
          key: listing.ml_item_id,
          ml_item_id: listing.ml_item_id,
          variation_id: null,
          title: listing.title,
          variation_name: null,
          sku: listing.sku || '',
          thumbnail_url: listing.thumbnail_url || ''
        });
      }
    }
  });

  return unmapped;
}

// ============================================================================
// SALVAMENTO DE VÍNCULOS FT E PROPAGAÇÃO DE SKU (CANAL SHOPEE)
// ============================================================================

export async function saveShopeeFtMappingsAndPropagateSku({
  empresaId = DEFAULT_EMPRESA_ID,
  mappingsByKey = {},
  skuByKey = {},
  propagateSku = true
}) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  const currentListings = await fetchStoredShopeeListings(safeEmpId);
  const listingsMap = new Map();
  currentListings.forEach((l) => listingsMap.set(String(l.ml_item_id), { ...l }));

  const ftsToUpdateSku = new Map();

  Object.entries(mappingsByKey).forEach(([targetKey, chosenFtKey]) => {
    if (!chosenFtKey) return;

    let itemId = targetKey;
    let variationId = null;
    if (targetKey.includes('__mlvar__')) {
      const parts = targetKey.split('__mlvar__');
      itemId = parts[0];
      variationId = parts[1];
    }

    const listing = listingsMap.get(String(itemId));
    if (listing) {
      if (variationId && Array.isArray(listing.variations) && listing.variations.length > 0) {
        listing.variations = listing.variations.map((v) =>
          String(v.id || v.model_id) === String(variationId)
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
      listingsMap.set(String(itemId), listing);
    } else {
      listingsMap.set(String(itemId), {
        empresa_id: safeEmpId,
        platform: 'shopee',
        ml_item_id: String(itemId),
        sku: skuByKey[targetKey] || '',
        ft_id: variationId ? null : chosenFtKey,
        variations: variationId
          ? [{ id: String(variationId), sku: skuByKey[targetKey] || '', ft_id: chosenFtKey }]
          : [],
        updated_at: new Date().toISOString()
      });
    }

    // Registra SKU para propagar para a FT e para o canal Shopee
    if (chosenFtKey && chosenFtKey !== '__IGNORED__') {
      const isVarKey = chosenFtKey.includes('__var__');
      const ftId = isVarKey ? chosenFtKey.split('__var__')[0] : chosenFtKey;
      const varId = isVarKey ? chosenFtKey.split('__var__')[1] : null;

      const itemSku = String(
        skuByKey[targetKey] ||
          (variationId
            ? listing?.variations?.find((v) => String(v.id || v.model_id) === String(variationId))?.sku
            : listing?.sku) ||
          ''
      ).trim();

      const shopeeEffectivePrice = Number(
        (variationId
          ? listing?.variations?.find((v) => String(v.id || v.model_id) === String(variationId))?.price
          : null) ||
          listing?.price_promo ||
          listing?.price ||
          0
      );

      const entry = ftsToUpdateSku.get(ftId) || { baseSku: null, varSkus: {}, shopeePrice: 0 };
      if (propagateSku && itemSku) {
        if (varId) {
          entry.varSkus[varId] = itemSku;
        } else {
          entry.baseSku = itemSku;
        }
      }
      if (shopeeEffectivePrice > 0) entry.shopeePrice = shopeeEffectivePrice;
      ftsToUpdateSku.set(ftId, entry);
    }
  });

  const updatedListings = await upsertShopeeListingsToDb(Array.from(listingsMap.values()), safeEmpId);

  // Propaga SKU e marca 'cadastrado: true' no canal 'shopee' em ecommerce_overrides
  for (const [ftId, skuChanges] of ftsToUpdateSku.entries()) {
    try {
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

      const ovResp = await fetch(
        `${getSupaUrl()}/rest/v1/ecommerce_overrides?channel_id=eq.shopee&ft_id=eq.${encodeURIComponent(ftId)}&select=*`,
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
        ...(skuChanges.shopeePrice > 0 && !curSettings.precoRealVenda
          ? { precoRealVenda: String(skuChanges.shopeePrice.toFixed(2)) }
          : {})
      };
      await fetch(`${getSupaUrl()}/rest/v1/ecommerce_overrides?on_conflict=channel_id,ft_id`, {
        method: 'POST',
        headers: { ...getSupaHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          channel_id: 'shopee',
          ft_id: ftId,
          settings: nextSettings
        })
      });
    } catch (e) {
      console.warn(`[Shopee Service] Aviso ao propagar SKU para ${ftId}:`, e);
    }
  }

  return updatedListings;
}

// ============================================================================
// CONSULTA DE VENDAS PAGAS DO MÊS (Dois chunks de até 15 dias - Regra Shopee)
// ============================================================================

export async function fetchShopeePaidOrdersForMonth({ empresaId = DEFAULT_EMPRESA_ID, monthStr }) {
  const safeEmpId = empresaId || DEFAULT_EMPRESA_ID;
  const tokenObj = await getValidShopeeToken(safeEmpId);
  const token = tokenObj.access_token;
  const shopId = tokenObj.ml_user_id;

  let targetYear, targetMonth;
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split('-').map(Number);
    targetYear = y;
    targetMonth = m - 1;
  } else {
    const now = new Date();
    targetYear = now.getFullYear();
    targetMonth = now.getMonth();
  }

  const startOfMonth = new Date(targetYear, targetMonth, 1, 0, 0, 0);
  const midOfMonth = new Date(targetYear, targetMonth, 15, 23, 59, 59);
  const day16 = new Date(targetYear, targetMonth, 16, 0, 0, 0);
  const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

  const ranges = [
    { from: Math.floor(startOfMonth.getTime() / 1000), to: Math.floor(midOfMonth.getTime() / 1000) },
    { from: Math.floor(day16.getTime() / 1000), to: Math.floor(endOfMonth.getTime() / 1000) }
  ];

  const allOrderSns = [];

  for (const range of ranges) {
    let cursor = '';
    while (true) {
      const listData = await shopeeProxyFetch('/api/v2/order/get_order_list', {
        method: 'GET',
        token,
        shopId,
        query: {
          time_range_field: 'pay_time',
          time_from: range.from,
          time_to: range.to,
          page_size: 50,
          cursor: cursor || undefined
        }
      });

      const orders = Array.isArray(listData?.response?.order_list) ? listData.response.order_list : [];
      orders.forEach((o) => {
        if (o?.order_sn && !allOrderSns.includes(o.order_sn)) {
          allOrderSns.push(o.order_sn);
        }
      });

      if (!listData?.response?.more || !listData?.response?.next_cursor) {
        break;
      }
      cursor = listData.response.next_cursor;
    }
  }

  if (allOrderSns.length === 0) {
    return {
      totalOrdersPaid: 0,
      totalOrdersCount: 0,
      salesByFtTarget: {},
      revenueByFtTarget: {},
      soldItems: [],
      unmappedSoldItems: [],
      listings: []
    };
  }

  const detailedOrders = [];
  for (let i = 0; i < allOrderSns.length; i += 50) {
    const chunk = allOrderSns.slice(i, i + 50).join(',');
    const detailData = await shopeeProxyFetch('/api/v2/order/get_order_detail', {
      method: 'GET',
      token,
      shopId,
      query: {
        order_sn_list: chunk,
        response_optional_fields: 'item_list,buyer_user_id,buyer_username,pay_time,total_amount,order_status'
      }
    });

    const orders = Array.isArray(detailData?.response?.order_list) ? detailData.response.order_list : [];
    detailedOrders.push(...orders);
  }

  let storedListings = await fetchStoredShopeeListings(safeEmpId);
  if (storedListings.length === 0 && detailedOrders.length > 0) {
    try {
      const syncRes = await syncListingsFromShopee(safeEmpId);
      storedListings = syncRes.listings || [];
    } catch (e) {
      console.warn('[Shopee Service] Aviso ao sincronizar anúncios durante busca de pedidos:', e);
    }
  }

  const listingsById = new Map();
  storedListings.forEach((l) => listingsById.set(String(l.ml_item_id), l));

  const validStatuses = ['READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 'COMPLETED', 'TO_CONFIRM_RECEIVE'];
  const soldItemsMap = new Map();

  detailedOrders.forEach((order) => {
    if (!validStatuses.includes(order.order_status)) return;

    const items = Array.isArray(order.item_list) ? order.item_list : [];
    items.forEach((item) => {
      const itemIdStr = String(item.item_id);
      const modelIdStr = item.model_id ? String(item.model_id) : '0';
      const key = modelIdStr !== '0' ? `${itemIdStr}__mlvar__${modelIdStr}` : itemIdStr;
      const qty = Number(item.model_quantity_purchased || 1);
      const unitPrice = Number(item.model_discounted_price || item.model_original_price || 0);
      const sku = String(item.model_sku || item.item_sku || '').trim();

      if (soldItemsMap.has(key)) {
        const prev = soldItemsMap.get(key);
        prev.quantitySold += qty;
        prev.totalRevenue += qty * unitPrice;
        prev.ordersCount += 1;
        if (!prev.sku && sku) prev.sku = sku;
      } else {
        soldItemsMap.set(key, {
          key,
          ml_item_id: itemIdStr,
          variation_id: modelIdStr !== '0' ? modelIdStr : null,
          title: item.item_name || 'Item Shopee',
          variation_name: item.model_name || '',
          sku,
          unit_price: unitPrice,
          totalRevenue: qty * unitPrice,
          quantitySold: qty,
          ordersCount: 1
        });
      }
    });
  });

  const soldItemsList = Array.from(soldItemsMap.values()).map((sold) => {
    const listing = listingsById.get(sold.ml_item_id);
    let ftLink = null;
    let thumb = listing?.thumbnail_url || '';
    let resolvedSku = sold.sku || listing?.sku || '';

    if (listing) {
      if (sold.variation_id && Array.isArray(listing.variations)) {
        const matchedVar = listing.variations.find((v) => String(v.id || v.model_id) === String(sold.variation_id));
        if (matchedVar) {
          ftLink = matchedVar.ft_id || listing.ft_id || null;
          resolvedSku = sold.sku || matchedVar.sku || resolvedSku;
        } else {
          ftLink = listing.ft_id || null;
        }
      } else {
        ftLink = listing.ft_id || null;
      }
    }

    if (!ftLink && resolvedSku) {
      ftLink = extractFtIdFromShopeeSku(resolvedSku);
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

  const paidCount = detailedOrders.filter((o) => validStatuses.includes(o.order_status)).length;

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
