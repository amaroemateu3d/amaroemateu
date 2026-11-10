import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import crypto from 'crypto'

function mlProxyDevPlugin() {
  return {
    name: 'ml-proxy-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/mlproxy', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')

        if (req.method === 'OPTIONS') {
          res.statusCode = 200
          res.end()
          return
        }

        try {
          const reqUrl = new URL(req.url || '', 'http://localhost')
          const target = reqUrl.searchParams.get('target')
          if (!target) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Parâmetro ?target= é obrigatório.' }))
            return
          }

          const parsedTarget = new URL(target)
          if (parsedTarget.hostname !== 'api.mercadolibre.com') {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Host não permitido no mlproxy.' }))
            return
          }

          reqUrl.searchParams.forEach((val, key) => {
            if (key !== 'target' && !parsedTarget.searchParams.has(key)) {
              parsedTarget.searchParams.set(key, val)
            }
          })

          const chunks = []
          for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
          }
          const rawBody = Buffer.concat(chunks)

          const forwardHeaders = {
            Accept: req.headers['accept'] || 'application/json'
          }
          if (req.headers['authorization']) {
            forwardHeaders['Authorization'] = req.headers['authorization']
          }
          if (req.headers['content-type']) {
            forwardHeaders['Content-Type'] = req.headers['content-type']
          }

          const fetchOptions = {
            method: req.method,
            headers: forwardHeaders
          }

          if (req.method !== 'GET' && req.method !== 'HEAD' && rawBody.length > 0) {
            fetchOptions.body = rawBody
          }

          const mlResp = await fetch(parsedTarget.toString(), fetchOptions)
          const text = await mlResp.text()

          res.statusCode = mlResp.status
          res.setHeader('Content-Type', mlResp.headers.get('content-type') || 'application/json; charset=utf-8')
          res.end(text)
        } catch (err) {
          console.error('[vite mlproxy] Erro:', err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err?.message || 'Erro no proxy local do Mercado Livre' }))
        }
      })
    }
  }
}

function shopeeProxyDevPlugin() {
  return {
    name: 'shopee-proxy-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/shopeeproxy', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, x-shopee-partner-id, x-shopee-partner-key')

        if (req.method === 'OPTIONS') {
          res.statusCode = 200
          res.end()
          return
        }

        try {
          const reqUrl = new URL(req.url || '', 'http://localhost')
          const target = reqUrl.searchParams.get('target')
          const reqPath = reqUrl.searchParams.get('path')
          const isTest = reqUrl.searchParams.get('is_test') === 'true'

          let targetUrl
          if (target) {
            targetUrl = new URL(target)
          } else if (reqPath) {
            const host = isTest ? 'partner.test-stable.shopeemobile.com' : 'partner.shopeemobile.com'
            const cleanPath = reqPath.startsWith('/') ? reqPath : `/${reqPath}`
            targetUrl = new URL(`https://${host}${cleanPath}`)
          } else {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Parâmetro ?target= ou ?path= é obrigatório.' }))
            return
          }

          // Adiciona query params restantes
          reqUrl.searchParams.forEach((val, key) => {
            if (!['target', 'path', 'is_test', 'partner_key'].includes(key) && !targetUrl.searchParams.has(key)) {
              targetUrl.searchParams.set(key, val)
            }
          })

          // Se tiver partner_id e partner_key (via header ou param), calcula sign se ausente
          const partnerId = targetUrl.searchParams.get('partner_id') || req.headers['x-shopee-partner-id'] || process.env.VITE_SHOPEE_PARTNER_ID
          const partnerKey = reqUrl.searchParams.get('partner_key') || req.headers['x-shopee-partner-key'] || process.env.VITE_SHOPEE_PARTNER_KEY
          const timestamp = targetUrl.searchParams.get('timestamp') || Math.floor(Date.now() / 1000)

          if (partnerId && !targetUrl.searchParams.has('partner_id')) {
            targetUrl.searchParams.set('partner_id', String(partnerId))
          }
          if (!targetUrl.searchParams.has('timestamp')) {
            targetUrl.searchParams.set('timestamp', String(timestamp))
          }

          if (!targetUrl.searchParams.has('sign') && partnerKey && partnerId) {
            let baseString = `${partnerId}${targetUrl.pathname}${targetUrl.searchParams.get('timestamp')}`
            const tok = targetUrl.searchParams.get('access_token')
            const sId = targetUrl.searchParams.get('shop_id')
            if (tok && sId) {
              baseString += `${tok}${sId}`
            }
            const sign = crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex')
            targetUrl.searchParams.set('sign', sign)
          }

          const chunks = []
          for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
          }
          const rawBody = Buffer.concat(chunks)

          const forwardHeaders = {
            Accept: req.headers['accept'] || 'application/json',
            'Content-Type': 'application/json'
          }

          const fetchOptions = {
            method: req.method,
            headers: forwardHeaders
          }

          if (req.method !== 'GET' && req.method !== 'HEAD' && rawBody.length > 0) {
            fetchOptions.body = rawBody
          }

          const shopeeResp = await fetch(targetUrl.toString(), fetchOptions)
          const text = await shopeeResp.text()

          res.statusCode = shopeeResp.status
          res.setHeader('Content-Type', shopeeResp.headers.get('content-type') || 'application/json; charset=utf-8')
          res.end(text)
        } catch (err) {
          console.error('[vite shopeeproxy] Erro:', err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err?.message || 'Erro no proxy local da Shopee' }))
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mlProxyDevPlugin(), shopeeProxyDevPlugin()],
})
