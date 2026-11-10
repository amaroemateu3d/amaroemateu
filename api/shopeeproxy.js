import crypto from 'crypto';

const ALLOWED_HOSTS = ['partner.shopeemobile.com', 'partner.test-stable.shopeemobile.com'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, x-shopee-partner-id, x-shopee-partner-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { target, partner_id, partner_key, path: reqPath, access_token, shop_id, sign: providedSign, timestamp: providedTs, is_test, ...extraQuery } = req.query || {};

    let targetUrl;
    if (target && typeof target === 'string') {
      targetUrl = new URL(target);
    } else if (reqPath && typeof reqPath === 'string') {
      const host = is_test === 'true' || is_test === true ? 'partner.test-stable.shopeemobile.com' : 'partner.shopeemobile.com';
      const cleanPath = reqPath.startsWith('/') ? reqPath : `/${reqPath}`;
      targetUrl = new URL(`https://${host}${cleanPath}`);
    } else {
      return res.status(400).json({ error: 'Parâmetro ?target= ou ?path= é obrigatório.' });
    }

    if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      return res.status(400).json({ error: `Host não permitido no shopeeproxy. Use ${ALLOWED_HOSTS.join(' ou ')}.` });
    }

    // Calcula a assinatura HMAC-SHA256 se partner_id e partner_key estiverem disponíveis e sign não foi fornecido
    const effectivePartnerId = partner_id || req.headers['x-shopee-partner-id'] || process.env.VITE_SHOPEE_PARTNER_ID || process.env.SHOPEE_PARTNER_ID;
    const effectivePartnerKey = partner_key || req.headers['x-shopee-partner-key'] || process.env.VITE_SHOPEE_PARTNER_KEY || process.env.SHOPEE_PARTNER_KEY;
    const timestamp = providedTs || Math.floor(Date.now() / 1000);

    if (effectivePartnerId && !targetUrl.searchParams.has('partner_id')) {
      targetUrl.searchParams.set('partner_id', String(effectivePartnerId));
    }
    if (!targetUrl.searchParams.has('timestamp')) {
      targetUrl.searchParams.set('timestamp', String(timestamp));
    }

    if (access_token && !targetUrl.searchParams.has('access_token')) {
      targetUrl.searchParams.set('access_token', String(access_token));
    }
    if (shop_id && !targetUrl.searchParams.has('shop_id')) {
      targetUrl.searchParams.set('shop_id', String(shop_id));
    }

    // Se a assinatura ainda não estiver nos params e tivermos a key, calcula a assinatura oficial da Shopee API v2
    if (!targetUrl.searchParams.has('sign')) {
      if (providedSign) {
        targetUrl.searchParams.set('sign', String(providedSign));
      } else if (effectivePartnerKey && effectivePartnerId) {
        let baseString = `${effectivePartnerId}${targetUrl.pathname}${targetUrl.searchParams.get('timestamp')}`;
        const tok = targetUrl.searchParams.get('access_token');
        const sId = targetUrl.searchParams.get('shop_id');
        if (tok && sId) {
          baseString += `${tok}${sId}`;
        }
        const calculatedSign = crypto.createHmac('sha256', effectivePartnerKey).update(baseString).digest('hex');
        targetUrl.searchParams.set('sign', calculatedSign);
      }
    }

    // Adiciona outros query params
    Object.entries(extraQuery).forEach(([k, v]) => {
      if (v !== undefined && v !== null && !targetUrl.searchParams.has(k)) {
        if (Array.isArray(v)) {
          v.forEach(val => targetUrl.searchParams.append(k, String(val)));
        } else {
          targetUrl.searchParams.set(k, String(v));
        }
      }
    });

    const forwardHeaders = {
      Accept: req.headers['accept'] || 'application/json',
      'Content-Type': 'application/json'
    };

    const fetchOptions = {
      method: req.method,
      headers: forwardHeaders
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined && req.body !== null) {
      fetchOptions.body = typeof req.body === 'object' && !(req.body instanceof Buffer)
        ? JSON.stringify(req.body)
        : req.body;
    }

    const shopeeResponse = await fetch(targetUrl.toString(), fetchOptions);
    const responseText = await shopeeResponse.text();

    const respContentType = shopeeResponse.headers.get('content-type') || 'application/json; charset=utf-8';
    res.setHeader('Content-Type', respContentType);
    return res.status(shopeeResponse.status).send(responseText);
  } catch (error) {
    console.error('[shopeeproxy] Erro ao comunicar com a API da Shopee:', error);
    return res.status(500).json({
      error: 'Falha ao comunicar com a API da Shopee via proxy.',
      details: error?.message || String(error)
    });
  }
}
