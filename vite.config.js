import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mlProxyDevPlugin()],
})
