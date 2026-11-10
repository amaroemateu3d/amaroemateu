export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { target, ...extraQuery } = req.query || {};
    if (!target || typeof target !== 'string') {
      return res.status(400).json({ error: 'Parâmetro ?target= é obrigatório.' });
    }

    const parsedTarget = new URL(target);
    if (parsedTarget.hostname !== 'api.mercadolibre.com') {
      return res.status(400).json({ error: 'Host não permitido no mlproxy. Use https://api.mercadolibre.com.' });
    }

    // Repassa query params adicionais que porventura não estavam embutidos na string target
    Object.entries(extraQuery).forEach(([key, val]) => {
      if (val !== undefined && val !== null && !parsedTarget.searchParams.has(key)) {
        if (Array.isArray(val)) {
          val.forEach((v) => parsedTarget.searchParams.append(key, String(v)));
        } else {
          parsedTarget.searchParams.set(key, String(val));
        }
      }
    });

    const forwardHeaders = {
      Accept: req.headers['accept'] || 'application/json'
    };

    if (req.headers['authorization']) {
      forwardHeaders['Authorization'] = req.headers['authorization'];
    }
    if (req.headers['content-type']) {
      forwardHeaders['Content-Type'] = req.headers['content-type'];
    }

    const fetchOptions = {
      method: req.method,
      headers: forwardHeaders
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined && req.body !== null) {
      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      if (typeof req.body === 'object' && !(req.body instanceof Buffer)) {
        if (contentType.includes('application/x-www-form-urlencoded')) {
          fetchOptions.body = new URLSearchParams(req.body).toString();
        } else {
          fetchOptions.body = JSON.stringify(req.body);
          if (!forwardHeaders['Content-Type']) {
            forwardHeaders['Content-Type'] = 'application/json';
          }
        }
      } else {
        fetchOptions.body = req.body;
      }
    }

    const mlResponse = await fetch(parsedTarget.toString(), fetchOptions);
    const responseText = await mlResponse.text();

    const respContentType = mlResponse.headers.get('content-type') || 'application/json; charset=utf-8';
    res.setHeader('Content-Type', respContentType);
    return res.status(mlResponse.status).send(responseText);
  } catch (error) {
    console.error('[mlproxy] Erro ao processar requisição para o Mercado Livre:', error);
    return res.status(500).json({
      error: 'Falha ao comunicar com a API do Mercado Livre via proxy.',
      details: error?.message || String(error)
    });
  }
}
