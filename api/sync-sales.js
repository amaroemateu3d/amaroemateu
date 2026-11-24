import crypto from 'crypto';

const DEFAULT_EMPRESA_ID = 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9';
const ML_API_BASE = 'https://api.mercadolibre.com';
const SHOPEE_LIVE_API_BASE = 'https://partner.shopeemobile.com';
const SHOPEE_VALID_PAID = ['READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 'COMPLETED', 'TO_CONFIRM_RECEIVE'];
const SHOPEE_CANCELLED = ['CANCELLED', 'IN_CANCEL', 'TO_RETURN'];

function getSupaConfig() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configuradas no servidor.');
  }
  return {
    url: url.replace(/\/$/, ''),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    }
  };
}

function getBrazilNow() {
  const now = new Date();
  const brMs = now.getTime() - 3 * 60 * 60 * 1000;
  return new Date(brMs);
}

function getCurrentBrazilMonth() {
  const br = getBrazilNow();
  const y = br.getUTCFullYear();
  const m = String(br.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function normStr(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function supaFetch(path, options = {}) {
  const { url, headers } = getSupaConfig();
  const resp = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!resp.ok) {
    throw new Error(`Supabase ${options.method || 'GET'} ${path} falhou (${resp.status}): ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

// ============================================================================
// TOKEN REFRESH (MERCADO LIVRE & SHOPEE)
// ============================================================================

async function getValidMlToken() {
  const rows = await supaFetch('marketplace_tokens?platform=eq.ml&order=updated_at.desc&limit=1');
  const stored = Array.isArray(rows) ? rows[0] : null;
  if (!stored || !stored.access_token) return null;

  const expiresMs = stored.expires_at ? new Date(stored.expires_at).getTime() : 0;
  const THIRTY_MIN = 30 * 60 * 1000;
  if (expiresMs && expiresMs - Date.now() > THIRTY_MIN) {
    return stored;
  }

  const clientId = String(process.env.VITE_ML_CLIENT_ID || process.env.ML_CLIENT_ID || '5281469754637132').trim();
  const clientSecret = String(process.env.VITE_ML_CLIENT_SECRET || process.env.ML_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret || !stored.refresh_token) {
    return stored;
  }

  const resp = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: stored.refresh_token
    }).toString()
  });

  const data = await resp.json();
  if (!resp.ok || !data?.access_token) {
    throw new Error(`Falha ao renovar token ML: ${data?.message || data?.error || resp.status}`);
  }

  const updated = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || stored.refresh_token,
    ml_user_id: String(data.user_id || stored.ml_user_id || ''),
    expires_at: new Date(Date.now() + Number(data.expires_in || 21600) * 1000).toISOString(),
    updated_at: new Date().toISOString()
  };

  await supaFetch(`marketplace_tokens?id=eq.${stored.id}`, {
    method: 'PATCH',
    body: JSON.stringify(updated)
  });

  return { ...stored, ...updated };
}

async function shopeeSignedFetch(apiPath, { method = 'GET', token = null, shopId = null, query = {}, body = null } = {}) {
  const partnerId = String(process.env.VITE_SHOPEE_PARTNER_ID || process.env.SHOPEE_PARTNER_ID || '2053326').trim();
  const partnerKey = String(process.env.VITE_SHOPEE_PARTNER_KEY || process.env.SHOPEE_PARTNER_KEY || 'shpk4361716f6f794366754d7147594c5a4258514362574a636e6c4b557a486f').trim();
  const timestamp = Math.floor(Date.now() / 1000);

  let baseString = `${partnerId}${apiPath}${timestamp}`;
  if (token && shopId) {
    baseString += `${token}${shopId}`;
  }
  const sign = crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex');

  const url = new URL(`${SHOPEE_LIVE_API_BASE}${apiPath}`);
  url.searchParams.set('partner_id', partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', sign);
  if (token) url.searchParams.set('access_token', String(token));
  if (shopId) url.searchParams.set('shop_id', String(shopId));
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  });

  const resp = await fetch(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await resp.json();
  if (!resp.ok || (data?.error && data.error !== '')) {
    throw new Error(`Shopee ${apiPath} erro: ${data?.message || data?.error || resp.status}`);
  }
  return data;
}

async function getValidShopeeToken() {
  const rows = await supaFetch('marketplace_tokens?platform=eq.shopee&order=updated_at.desc&limit=1');
  const stored = Array.isArray(rows) ? rows[0] : null;
  if (!stored || !stored.access_token) return null;

  const expiresMs = stored.expires_at ? new Date(stored.expires_at).getTime() : 0;
  const THIRTY_MIN = 30 * 60 * 1000;
  if (expiresMs && expiresMs - Date.now() > THIRTY_MIN) {
    return stored;
  }

  if (!stored.refresh_token) return stored;

  const partnerId = Number(process.env.VITE_SHOPEE_PARTNER_ID || process.env.SHOPEE_PARTNER_ID || '2053326');
  const shopId = Number(stored.ml_user_id);

  const data = await shopeeSignedFetch('/api/v2/auth/access_token/get', {
    method: 'POST',
    body: {
      refresh_token: stored.refresh_token,
      partner_id: partnerId,
      shop_id: shopId
    }
  });

  if (!data?.access_token) {
    throw new Error('Shopee não retornou access_token ao renovar.');
  }

  const updated = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || stored.refresh_token,
    expires_at: new Date(Date.now() + Number(data.expire_in || 14400) * 1000).toISOString(),
    updated_at: new Date().toISOString()
  };

  await supaFetch(`marketplace_tokens?id=eq.${stored.id}`, {
    method: 'PATCH',
    body: JSON.stringify(updated)
  });

  return { ...stored, ...updated };
}

// ============================================================================
// MAPEAMENTO ITEM -> (FT_ID, VAR_ID)
// ============================================================================

function resolveFtAndVar({ itemId, variationId, sku, variationName, listingsById, ftsMap, ftsList }) {
  let rawLink = null;
  const listing = listingsById.get(String(itemId));
  let resolvedSku = String(sku || '').trim();

  if (listing) {
    if (variationId && Array.isArray(listing.variations)) {
      const mVar = listing.variations.find((v) => String(v.id) === String(variationId));
      if (mVar) {
        rawLink = mVar.ft_id || listing.ft_id || null;
        if (!resolvedSku && mVar.sku) resolvedSku = String(mVar.sku).trim();
      } else {
        rawLink = listing.ft_id || null;
      }
    } else {
      rawLink = listing.ft_id || null;
    }
    if (!resolvedSku && listing.sku) resolvedSku = String(listing.sku).trim();
  }

  let ftId = null;
  let varId = null;

  if (rawLink) {
    if (String(rawLink).includes('__var__')) {
      const [base, vId] = String(rawLink).split('__var__');
      ftId = base;
      varId = vId || null;
    } else {
      ftId = String(rawLink);
    }
  }

  // Fallback por SKU se ainda não achou FT
  if (!ftId && resolvedSku) {
    const skuNorm = normStr(resolvedSku);
    for (const ft of ftsList) {
      if (Array.isArray(ft.variacoesEstoque)) {
        const matchedVar = ft.variacoesEstoque.find((v) => v.sku && normStr(v.sku) === skuNorm);
        if (matchedVar) {
          ftId = ft.indiceFt;
          varId = matchedVar.id || null;
          break;
        }
      }
      if (ft.sku && normStr(ft.sku) === skuNorm) {
        ftId = ft.indiceFt;
        break;
      }
    }
  }

  // Se temos ftId mas não temos varId, tenta casar pela variação da FT (SKU ou nome da cor)
  if (ftId && !varId) {
    const ft = ftsMap.get(ftId);
    if (ft && Array.isArray(ft.variacoesEstoque) && ft.variacoesEstoque.length > 0) {
      const skuNorm = normStr(resolvedSku);
      const varNorm = normStr(variationName);
      let found = null;
      if (skuNorm) {
        found = ft.variacoesEstoque.find((v) => v.sku && normStr(v.sku) === skuNorm);
      }
      if (!found && varNorm) {
        found = ft.variacoesEstoque.find((v) => {
          const vn = normStr(v.nome);
          return vn && (vn === varNorm || varNorm.includes(vn) || vn.includes(varNorm));
        });
      }
      if (found) varId = found.id || null;
    }
  }

  return { ftId, varId, sku: resolvedSku };
}

// ============================================================================
// BAIXA / DEVOLUÇÃO DE ESTOQUE (GALPÃO PRIMEIRO, DEPOIS CASA)
// ============================================================================

function applyStockDeltaInMemory(ftRow, delta, varId = null) {
  // delta > 0 = venda (abate estoque); delta < 0 = cancelamento (devolve estoque)
  // Estoque unificado em estoqueGalpao (estoqueCasa = 0)
  if (!ftRow || !ftRow.data || delta === 0) return false;
  const ftData = ftRow.data;

  if (varId && Array.isArray(ftData.variacoesEstoque) && ftData.variacoesEstoque.length > 0) {
    const idx = ftData.variacoesEstoque.findIndex((v) => String(v.id) === String(varId));
    if (idx !== -1) {
      const v = { ...ftData.variacoesEstoque[idx] };
      const currentTotal = (Number(v.estoqueGalpao) || 0) + (Number(v.estoqueCasa) || 0);
      const nextTotal = Math.max(0, currentTotal - delta);

      v.estoqueGalpao = nextTotal;
      v.estoqueCasa = 0;
      const newVars = [...ftData.variacoesEstoque];
      newVars[idx] = v;
      ftData.variacoesEstoque = newVars;
      const sumAll = newVars.reduce((acc, item) => acc + (Number(item.estoqueGalpao) || 0) + (Number(item.estoqueCasa) || 0), 0);
      ftData.estoqueGalpao = sumAll;
      ftData.estoqueCasa = 0;
      ftRow.estoque = sumAll;
      ftRow._dirty = true;
      return true;
    }
  }

  // Sem variação específica: abate/devolve no estoque unificado da FT
  const currentTotal = (Number(ftData.estoqueGalpao) || 0) + (Number(ftData.estoqueCasa) || 0);
  const nextTotal = Math.max(0, currentTotal - delta);

  ftData.estoqueGalpao = nextTotal;
  ftData.estoqueCasa = 0;
  ftRow.estoque = nextTotal;
  ftRow._dirty = true;
  return true;
}

// ============================================================================
// BUSCA DE PEDIDOS DO MÊS (ML & SHOPEE)
// ============================================================================

async function fetchMlOrdersForMonth(tokenObj, monthStr) {
  const [yearStr, mStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(mStr, 10);
  const lastDay = new Date(year, month, 0).getDate();
  const fromIso = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000-03:00`;
  const toIso = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999-03:00`;

  const allOrders = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const query = new URLSearchParams({
      seller: String(tokenObj.ml_user_id),
      'order.date_created.from': fromIso,
      'order.date_created.to': toIso,
      sort: 'date_desc',
      offset: String(offset),
      limit: String(limit)
    }).toString();

    const resp = await fetch(`${ML_API_BASE}/orders/search?${query}`, {
      headers: { Authorization: `Bearer ${tokenObj.access_token}`, Accept: 'application/json' }
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(`ML orders/search erro ${resp.status}: ${data?.message || JSON.stringify(data)}`);
    }

    const results = Array.isArray(data?.results) ? data.results : [];
    allOrders.push(...results);
    if (results.length < limit) break;
    offset += limit;
    if (offset >= 1000) break;
  }

  const normalized = [];
  for (const order of allOrders) {
    const orderId = String(order.id || '');
    if (!orderId) continue;
    const isPaid = order.status === 'paid';
    const isCancelled = order.status === 'cancelled';
    if (!isPaid && !isCancelled) continue;

    const orderDate = order.date_created || null;
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    items.forEach((oi, idx) => {
      const itemObj = oi.item || {};
      const itemId = String(itemObj.id || '');
      if (!itemId) return;
      const variationId = itemObj.variation_id ? String(itemObj.variation_id) : null;
      const itemKey = variationId ? `${itemId}__${variationId}__${idx}` : `${itemId}__${idx}`;
      const qty = Number(oi.quantity || 0);
      if (qty <= 0) return;

      const varAttrs = Array.isArray(itemObj.variation_attributes)
        ? itemObj.variation_attributes.map((a) => a.value_name || a.name).filter(Boolean).join(' / ')
        : '';

      normalized.push({
        platform: 'ml',
        order_id: orderId,
        order_item_key: itemKey,
        itemId,
        variationId,
        sku: String(itemObj.seller_sku || itemObj.seller_custom_field || '').trim(),
        title: itemObj.title || 'Item ML',
        variation_name: varAttrs,
        quantity: qty,
        unit_price: Number(oi.unit_price || 0),
        isPaid,
        isCancelled,
        order_date: orderDate
      });
    });
  }

  return normalized;
}

async function fetchShopeeOrdersForMonth(tokenObj, monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const startOfMonth = new Date(Date.UTC(y, m - 1, 1, 3, 0, 0)); // 00:00 BRT
  const endOfMonthRaw = new Date(Date.UTC(y, m, 0, 26, 59, 59)); // 23:59 BRT
  const nowDate = new Date();
  const effectiveEnd = endOfMonthRaw > nowDate ? nowDate : endOfMonthRaw;

  const ranges = [];
  const MAX_CHUNK_SEC = 14 * 24 * 60 * 60;
  let curFrom = Math.floor(startOfMonth.getTime() / 1000);
  const maxTo = Math.floor(effectiveEnd.getTime() / 1000);
  while (curFrom < maxTo) {
    const curTo = Math.min(curFrom + MAX_CHUNK_SEC, maxTo);
    ranges.push({ from: curFrom, to: curTo });
    curFrom = curTo + 1;
  }

  const allOrderSns = [];
  for (const range of ranges) {
    let cursor = '';
    while (true) {
      const listData = await shopeeSignedFetch('/api/v2/order/get_order_list', {
        method: 'GET',
        token: tokenObj.access_token,
        shopId: tokenObj.ml_user_id,
        query: {
          time_range_field: 'create_time',
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

      if (!listData?.response?.more || !listData?.response?.next_cursor) break;
      cursor = listData.response.next_cursor;
    }
  }

  if (allOrderSns.length === 0) return [];

  const detailedOrders = [];
  for (let i = 0; i < allOrderSns.length; i += 50) {
    const chunk = allOrderSns.slice(i, i + 50).join(',');
    const detailData = await shopeeSignedFetch('/api/v2/order/get_order_detail', {
      method: 'GET',
      token: tokenObj.access_token,
      shopId: tokenObj.ml_user_id,
      query: {
        order_sn_list: chunk,
        response_optional_fields: 'item_list,pay_time,total_amount,order_status,create_time'
      }
    });
    const orders = Array.isArray(detailData?.response?.order_list) ? detailData.response.order_list : [];
    detailedOrders.push(...orders);
  }

  const normalized = [];
  for (const order of detailedOrders) {
    const orderId = String(order.order_sn || '');
    if (!orderId) continue;
    const isPaid = SHOPEE_VALID_PAID.includes(order.order_status);
    const isCancelled = SHOPEE_CANCELLED.includes(order.order_status);
    if (!isPaid && !isCancelled) continue;

    const orderDate = order.create_time ? new Date(order.create_time * 1000).toISOString() : null;
    const items = Array.isArray(order.item_list) ? order.item_list : [];
    items.forEach((item, idx) => {
      const itemId = String(item.item_id || '');
      if (!itemId) return;
      const modelId = item.model_id && String(item.model_id) !== '0' ? String(item.model_id) : null;
      const itemKey = modelId ? `${itemId}__${modelId}__${idx}` : `${itemId}__${idx}`;
      const qty = Number(item.model_quantity_purchased || 1);
      if (qty <= 0) return;

      normalized.push({
        platform: 'shopee',
        order_id: orderId,
        order_item_key: itemKey,
        itemId,
        variationId: modelId,
        sku: String(item.model_sku || item.item_sku || '').trim(),
        title: item.item_name || 'Item Shopee',
        variation_name: item.model_name || '',
        quantity: qty,
        unit_price: Number(item.model_discounted_price || item.model_original_price || 0),
        isPaid,
        isCancelled,
        order_date: orderDate
      });
    });
  }

  return normalized;
}

// ============================================================================
// PROCESSAMENTO DE UMA PLATAFORMA (ML OU SHOPEE)
// ============================================================================

async function processPlatformOrders({
  platform,
  orders,
  monthStr,
  isBaseline,
  listingsById,
  ftsRowMap,
  ftsDataMap,
  ftsList,
  existingSyncedMap,
  overridesByFt
}) {
  let newOrdersCount = 0;
  let cancelledOrdersCount = 0;
  let stockDeductedUnits = 0;
  let stockRestoredUnits = 0;
  const rowsToUpsert = [];
  const processedPaidRows = [];

  for (const item of orders) {
    const compositeKey = `${platform}__${item.order_id}__${item.order_item_key}`;
    const existing = existingSyncedMap.get(compositeKey);
    const { ftId, varId, sku } = resolveFtAndVar({
      itemId: item.itemId,
      variationId: item.variationId,
      sku: item.sku,
      variationName: item.variation_name,
      listingsById,
      ftsMap: ftsDataMap,
      ftsList
    });

    if (item.isPaid) {
      const rowData = {
        empresa_id: DEFAULT_EMPRESA_ID,
        platform,
        order_id: item.order_id,
        order_item_key: item.order_item_key,
        month: monthStr,
        ft_id: ftId || existing?.ft_id || null,
        var_id: varId || existing?.var_id || null,
        sku: sku || existing?.sku || '',
        title: item.title,
        variation_name: item.variation_name || '',
        quantity: item.quantity,
        unit_price: item.unit_price,
        status: 'paid',
        stock_deducted: true,
        order_date: item.order_date,
        updated_at: new Date().toISOString()
      };

      if (!existing) {
        newOrdersCount += 1;
        if (!isBaseline && rowData.ft_id) {
          const ftRow = ftsRowMap.get(rowData.ft_id);
          if (applyStockDeltaInMemory(ftRow, item.quantity, rowData.var_id)) {
            stockDeductedUnits += item.quantity;
          }
        }
        rowsToUpsert.push(rowData);
        existingSyncedMap.set(compositeKey, rowData);
      } else if (!existing.stock_deducted && existing.status === 'cancelled') {
        // Pedido voltou a ser pago (raro)
        if (!isBaseline && rowData.ft_id) {
          const ftRow = ftsRowMap.get(rowData.ft_id);
          if (applyStockDeltaInMemory(ftRow, item.quantity, rowData.var_id)) {
            stockDeductedUnits += item.quantity;
          }
        }
        rowsToUpsert.push(rowData);
        existingSyncedMap.set(compositeKey, rowData);
      }

      processedPaidRows.push(rowData);
    } else if (item.isCancelled && existing && existing.stock_deducted) {
      cancelledOrdersCount += 1;
      const targetFtId = existing.ft_id || ftId;
      const targetVarId = existing.var_id || varId;
      if (!isBaseline && targetFtId) {
        const ftRow = ftsRowMap.get(targetFtId);
        if (applyStockDeltaInMemory(ftRow, -Number(existing.quantity || item.quantity), targetVarId)) {
          stockRestoredUnits += Number(existing.quantity || item.quantity);
        }
      }
      const cancelledRow = {
        ...existing,
        status: 'cancelled',
        stock_deducted: false,
        updated_at: new Date().toISOString()
      };
      rowsToUpsert.push(cancelledRow);
      existingSyncedMap.set(compositeKey, cancelledRow);
    }
  }

  // Upsert em lotes na tabela marketplace_orders_synced
  for (let i = 0; i < rowsToUpsert.length; i += 50) {
    const chunk = rowsToUpsert.slice(i, i + 50);
    await supaFetch('marketplace_orders_synced?on_conflict=platform,order_id,order_item_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(chunk)
    });
  }

  // Recalcula totais do mês (FT + Variações) e preço médio real para ecommerce_monthly_sales e ecommerce_overrides
  const qtyByFt = new Map();
  const revByFt = new Map();
  const qtyByVarKey = new Map();

  for (const row of processedPaidRows) {
    if (!row.ft_id) continue;
    qtyByFt.set(row.ft_id, (qtyByFt.get(row.ft_id) || 0) + Number(row.quantity || 0));
    revByFt.set(row.ft_id, (revByFt.get(row.ft_id) || 0) + Number(row.quantity || 0) * Number(row.unit_price || 0));
    if (row.var_id) {
      const vKey = `${row.ft_id}__var__${row.var_id}`;
      qtyByVarKey.set(vKey, (qtyByVarKey.get(vKey) || 0) + Number(row.quantity || 0));
    }
  }

  const salesUpserts = [];
  for (const [ftId, qty] of qtyByFt.entries()) {
    if (qty > 0) {
      salesUpserts.push({
        month: monthStr,
        channel_id: platform,
        ft_id: ftId,
        quantity: qty
      });
    }
  }
  for (const [vKey, qty] of qtyByVarKey.entries()) {
    if (qty > 0) {
      salesUpserts.push({
        month: monthStr,
        channel_id: platform,
        ft_id: vKey,
        quantity: qty
      });
    }
  }

  // Atualiza preço médio real no ecommerce_overrides
  const overrideUpserts = [];
  for (const [ftId, qty] of qtyByFt.entries()) {
    const totalRev = revByFt.get(ftId) || 0;
    if (qty <= 0 || totalRev <= 0) continue;
    const avgPrice = Number((totalRev / qty).toFixed(2));
    const currentOv = overridesByFt.get(ftId) || {};
    const currentSettings = currentOv.settings || {};
    const prevMesMap = currentSettings.precoRealVendaMes || {};

    if (Number(prevMesMap[monthStr]) !== avgPrice || Number(currentSettings.precoRealVenda) !== avgPrice) {
      const nextSettings = {
        ...currentSettings,
        precoRealVenda: avgPrice,
        precoRealVendaMes: { ...prevMesMap, [monthStr]: avgPrice }
      };
      overrideUpserts.push({
        channel_id: platform,
        ft_id: ftId,
        settings: nextSettings
      });
      overridesByFt.set(ftId, { ...currentOv, settings: nextSettings });
    }
  }

  if (salesUpserts.length > 0 || overrideUpserts.length > 0) {
    await supaFetch('rpc/sync_apply_marketplace_updates', {
      method: 'POST',
      body: JSON.stringify({
        p_sales: salesUpserts,
        p_overrides: overrideUpserts,
        p_ft_stocks: []
      })
    });
  }

  return {
    totalPaidItems: processedPaidRows.length,
    newOrdersCount,
    cancelledOrdersCount,
    stockDeductedUnits,
    stockRestoredUnits,
    ftsUpdated: qtyByFt.size
  };
}

// ============================================================================
// SINCRONIZAÇÃO DE ESTOQUE ATUAL DOS ANÚNCIOS (ML & SHOPEE -> marketplace_listings)
// ============================================================================

async function syncMlListingsStocks(tokenObj, allListings) {
  const mlRows = (allListings || []).filter((l) => (!l.platform || l.platform === 'ml') && l.ml_item_id);
  if (mlRows.length === 0) return 0;

  const attributesList = ['id', 'price', 'base_price', 'original_price', 'available_quantity', 'status', 'variations'].join(',');
  const updates = [];
  const nowIso = new Date().toISOString();

  for (let i = 0; i < mlRows.length; i += 20) {
    const chunk = mlRows.slice(i, i + 20);
    const idsStr = chunk.map((r) => r.ml_item_id).join(',');
    const resp = await fetch(`${ML_API_BASE}/items?ids=${encodeURIComponent(idsStr)}&attributes=${encodeURIComponent(attributesList)}`, {
      headers: { Authorization: `Bearer ${tokenObj.access_token}`, Accept: 'application/json' }
    });
    if (!resp.ok) continue;
    const multiData = await resp.json();
    if (!Array.isArray(multiData)) continue;

    for (const entry of multiData) {
      const body = entry?.body;
      if (!body || !body.id) continue;
      const prev = chunk.find((r) => String(r.ml_item_id) === String(body.id));
      if (!prev) continue;

      const rawVars = Array.isArray(body.variations) ? body.variations : [];
      const prevVars = Array.isArray(prev.variations) ? prev.variations : [];
      let nextVars = prevVars;
      let nextStockMl = Number(body.available_quantity ?? prev.stock_ml ?? 0);

      if (rawVars.length > 0 && prevVars.length > 0) {
        const liveMap = new Map(rawVars.map((rv) => [String(rv.id), rv]));
        nextVars = prevVars.map((pv) => {
          const lv = liveMap.get(String(pv.id));
          if (!lv) return pv;
          return {
            ...pv,
            stock_ml: Number(lv.available_quantity ?? pv.stock_ml ?? 0),
            price: Number(lv.price ?? body.price ?? pv.price ?? 0)
          };
        });
        nextStockMl = nextVars.reduce((acc, v) => acc + Number(v.stock_ml || 0), 0);
      }

      if (nextStockMl !== Number(prev.stock_ml) || body.status !== prev.status || JSON.stringify(nextVars) !== JSON.stringify(prevVars)) {
        updates.push({
          ...prev,
          status: body.status || prev.status,
          stock_ml: nextStockMl,
          variations: nextVars,
          updated_at: nowIso
        });
      }
    }
  }

  if (updates.length > 0) {
    await supaFetch('marketplace_listings?on_conflict=ml_item_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(updates)
    });
  }
  return updates.length;
}

async function syncShopeeListingsStocks(tokenObj, allListings) {
  const shopeeRows = (allListings || []).filter((l) => l.platform === 'shopee' && l.ml_item_id);
  if (shopeeRows.length === 0) return 0;

  const shopId = Number(tokenObj.ml_user_id);
  const accessToken = tokenObj.access_token;
  const updates = [];
  const nowIso = new Date().toISOString();

  for (let i = 0; i < shopeeRows.length; i += 40) {
    const chunk = shopeeRows.slice(i, i + 40);
    const idListStr = chunk.map((r) => r.ml_item_id).join(',');
    try {
      const baseResp = await shopeeSignedFetch('/api/v2/product/get_item_base_info', {
        method: 'GET',
        token: accessToken,
        shopId,
        query: { item_id_list: idListStr }
      });
      const itemList = baseResp?.response?.item_list || [];
      for (const item of itemList) {
        const itemIdStr = String(item.item_id);
        const prev = chunk.find((r) => String(r.ml_item_id) === itemIdStr);
        if (!prev) continue;

        let nextVars = Array.isArray(prev.variations) ? [...prev.variations] : [];
        let nextStock = Number(
          item?.stock_info_v2?.summary_info?.total_available_stock ??
          item?.stock_info?.[0]?.current_stock ??
          prev.stock_ml ??
          0
        );

        if (item.has_model && nextVars.length > 0) {
          try {
            const modelResp = await shopeeSignedFetch('/api/v2/product/get_model_list', {
              method: 'GET',
              token: accessToken,
              shopId,
              query: { item_id: itemIdStr }
            });
            const models = modelResp?.response?.model || [];
            if (models.length > 0) {
              const mMap = new Map(models.map((m) => [String(m.model_id), m]));
              nextVars = nextVars.map((pv) => {
                const lm = mMap.get(String(pv.id || pv.model_id));
                if (!lm) return pv;
                const st = Number(
                  lm?.stock_info_v2?.summary_info?.total_available_stock ??
                  lm?.stock_info?.[0]?.current_stock ??
                  pv.stock ??
                  0
                );
                return { ...pv, stock: st, stock_ml: st };
              });
              nextStock = nextVars.reduce((acc, v) => acc + Number(v.stock ?? v.stock_ml ?? 0), 0);
            }
          } catch {
            // ignore single model error
          }
        }

        if (nextStock !== Number(prev.stock_ml) || JSON.stringify(nextVars) !== JSON.stringify(prev.variations)) {
          updates.push({
            ...prev,
            stock_ml: nextStock,
            variations: nextVars,
            updated_at: nowIso
          });
        }
      }
    } catch {
      // ignore chunk error
    }
  }

  if (updates.length > 0) {
    await supaFetch('marketplace_listings?on_conflict=ml_item_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(updates)
    });
  }
  return updates.length;
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-sync-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Validação opcional de segredo se configurado na Vercel
    const configuredSecret = process.env.SYNC_CRON_SECRET;
    if (configuredSecret) {
      const provided =
        req.headers['x-sync-secret'] ||
        (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') ||
        req.query?.secret;
      if (provided !== configuredSecret) {
        return res.status(401).json({ error: 'Não autorizado (x-sync-secret inválido).' });
      }
    }

    const mode = String(req.query?.mode || req.body?.mode || 'sync').toLowerCase();
    const runType = String(req.query?.source || req.body?.source || (mode === 'baseline' ? 'baseline' : 'cron'));
    const isBaseline = mode === 'baseline';
    const monthStr = String(req.query?.month || req.body?.month || getCurrentBrazilMonth());

    // 1. Carrega FTs, Listings, Overrides (via RPC seguro) e Pedidos já sincronizados do mês
    const [snapshot, existingSynced] = await Promise.all([
      supaFetch('rpc/sync_get_catalog_snapshot', { method: 'POST', body: '{}' }),
      supaFetch(`marketplace_orders_synced?month=eq.${encodeURIComponent(monthStr)}&select=*`)
    ]);
    const ftRows = snapshot?.fts || [];
    const allListings = snapshot?.listings || [];
    const allOverrides = snapshot?.overrides || [];

    const ftsRowMap = new Map();
    const ftsDataMap = new Map();
    const ftsList = [];
    (ftRows || []).forEach((row) => {
      const indice = row?.data?.indiceFt || row.id;
      if (indice) {
        ftsRowMap.set(indice, row);
        ftsDataMap.set(indice, row.data);
        ftsList.push(row.data);
      }
    });

    const mlListingsById = new Map();
    const shopeeListingsById = new Map();
    (allListings || []).forEach((l) => {
      if (l.platform === 'shopee') shopeeListingsById.set(String(l.ml_item_id), l);
      else mlListingsById.set(String(l.ml_item_id), l);
    });

    const mlOverridesByFt = new Map();
    const shopeeOverridesByFt = new Map();
    (allOverrides || []).forEach((o) => {
      if (o.channel_id === 'shopee') shopeeOverridesByFt.set(o.ft_id, o);
      else mlOverridesByFt.set(o.ft_id, o);
    });

    const existingSyncedMap = new Map();
    (existingSynced || []).forEach((row) => {
      existingSyncedMap.set(`${row.platform}__${row.order_id}__${row.order_item_key}`, row);
    });

    const summary = {
      ok: true,
      mode,
      runType,
      month: monthStr,
      timestamp: new Date().toISOString(),
      ml: { skipped: false, error: null },
      shopee: { skipped: false, error: null },
      stockDeductedUnits: 0,
      stockRestoredUnits: 0
    };

    // 2. Sincroniza Mercado Livre
    try {
      const mlToken = await getValidMlToken();
      if (!mlToken) {
        summary.ml = { skipped: true, reason: 'Conta ML não conectada' };
      } else {
        const mlOrders = await fetchMlOrdersForMonth(mlToken, monthStr);
        const mlRes = await processPlatformOrders({
          platform: 'ml',
          orders: mlOrders,
          monthStr,
          isBaseline,
          listingsById: mlListingsById,
          ftsRowMap,
          ftsDataMap,
          ftsList,
          existingSyncedMap,
          overridesByFt: mlOverridesByFt
        });
        const mlStocksSynced = await syncMlListingsStocks(mlToken, allListings);
        summary.ml = { ...mlRes, listingsStockSynced: mlStocksSynced };
        summary.stockDeductedUnits += mlRes.stockDeductedUnits;
        summary.stockRestoredUnits += mlRes.stockRestoredUnits;
      }
    } catch (err) {
      summary.ml = { error: err?.message || String(err) };
    }

    // 3. Sincroniza Shopee
    try {
      const shopeeToken = await getValidShopeeToken();
      if (!shopeeToken) {
        summary.shopee = { skipped: true, reason: 'Conta Shopee não conectada' };
      } else {
        const shopeeOrders = await fetchShopeeOrdersForMonth(shopeeToken, monthStr);
        const shopeeRes = await processPlatformOrders({
          platform: 'shopee',
          orders: shopeeOrders,
          monthStr,
          isBaseline,
          listingsById: shopeeListingsById,
          ftsRowMap,
          ftsDataMap,
          ftsList,
          existingSyncedMap,
          overridesByFt: shopeeOverridesByFt
        });
        const shopeeStocksSynced = await syncShopeeListingsStocks(shopeeToken, allListings);
        summary.shopee = { ...shopeeRes, listingsStockSynced: shopeeStocksSynced };
        summary.stockDeductedUnits += shopeeRes.stockDeductedUnits;
        summary.stockRestoredUnits += shopeeRes.stockRestoredUnits;
      }
    } catch (err) {
      summary.shopee = { error: err?.message || String(err) };
    }

    // 4. Persiste somente as FTs que tiveram alteração real de estoque (via RPC seguro)
    const dirtyFts = Array.from(ftsRowMap.values()).filter((r) => r._dirty);
    if (dirtyFts.length > 0) {
      await supaFetch('rpc/sync_apply_marketplace_updates', {
        method: 'POST',
        body: JSON.stringify({
          p_sales: [],
          p_overrides: [],
          p_ft_stocks: dirtyFts.map((ftRow) => ({
            id: ftRow.id,
            estoque: ftRow.estoque,
            data: ftRow.data
          }))
        })
      });
    }

    const overallStatus =
      summary.ml?.error && summary.shopee?.error
        ? 'error'
        : summary.ml?.error || summary.shopee?.error
          ? 'partial'
          : 'ok';

    // 5. Grava log da execução em marketplace_sync_logs
    await supaFetch('marketplace_sync_logs', {
      method: 'POST',
      body: JSON.stringify({
        empresa_id: DEFAULT_EMPRESA_ID,
        run_type: runType,
        month: monthStr,
        ml_new_orders: summary.ml?.newOrdersCount || 0,
        ml_cancelled_orders: summary.ml?.cancelledOrdersCount || 0,
        shopee_new_orders: summary.shopee?.newOrdersCount || 0,
        shopee_cancelled_orders: summary.shopee?.cancelledOrdersCount || 0,
        stock_deducted_units: summary.stockDeductedUnits,
        stock_restored_units: summary.stockRestoredUnits,
        status: overallStatus,
        details: {
          ml: summary.ml,
          shopee: summary.shopee,
          dirtyFtsCount: dirtyFts.length
        }
      })
    });

    return res.status(200).json({ ...summary, status: overallStatus, dirtyFtsCount: dirtyFts.length });
  } catch (error) {
    console.error('[sync-sales] Erro fatal:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || String(error)
    });
  }
}
