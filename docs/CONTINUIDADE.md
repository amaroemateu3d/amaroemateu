# Guia de Continuidade do Projeto - AM3D Soluções (amaroemateu)

Este documento registra o estado atual do sistema, decisões de arquitetura, configurações de ambiente e o guia para retomar o trabalho em outra máquina ou na próxima sessão.

---

## 1. Resumo da Arquitetura e Módulos

O sistema é uma aplicação SPA moderna em **React + Vite**, hospedada na **Vercel** e conectada ao **Supabase** (PostgreSQL com Row Level Security):

- **Fichas Técnicas (`src/pages/FichasTecnicas.jsx`)**: Cadastro completo de peças, insumos, peso, tempos, custos e campo **SKU do Produto**.
- **Controle de Estoque (`src/pages/Estoque.jsx`)**:
  - Aba *Estoque Físico*: controle duplo (Galpão vs Casa), suporte a variações de estoque (`variacoesEstoque`) e botão *Igualar* com anúncios do Mercado Livre.
  - Aba *Anúncios Mercado Livre*: visualização dos 60 anúncios sincronizados da conta `AMAROEMATEU3D`, suporte a variações expansíveis, atualização de estoque em tempo real e status ativo/pausado.
- **Vendas Multi-Canal (`src/pages/Vendas.jsx`)**:
  - Precificação por canal (Mercado Livre, Shopee, Amazon, TikTok, Site Próprio).
  - Tabela com colunas de Cadastro (markup 30%), Venda (ideal) e Queima (break-even).
  - Integração oficial com a API do ML via botão **📦 Puxar Vendas ML**: agrupa pedidos pagos do mês por FT, permite vincular itens na 1ª vez via `MlFtMappingModal`, exibe o valor real praticado no marketplace e calcula **% Margem** e **Lucro Líquido** com base no valor real de venda.
- **Backend / Serverless (`api/mlproxy.js` e `vite.config.js`)**:
  - Proxy para contorno de CORS da API do Mercado Livre tanto em produção (Vercel Serverless Function) quanto em desenvolvimento local (`mlProxyDevPlugin` no Vite).
- **Serviço Mercado Livre (`src/services/mercadolivre.js`)**:
  - OAuth 2.0 com renovação automática (auto-refresh) via `refresh_token` salvo no Supabase.
  - Sincronização paginada e multiget de anúncios e variações.
  - Extração inteligente de SKUs e mapeamento de FTs.

---

## 2. Comandos e Ambiente

- **Node.js**: v18+ (testado em v20/v24).
- **Instalar Dependências**:
  ```bash
  npm install
  ```
- **Iniciar em Desenvolvimento**:
  ```bash
  npm run dev
  ```
- **Validar Build de Produção**:
  ```bash
  npm run build
  ```

---

## 3. Variáveis de Ambiente (`.env.local`)

Para rodar em outra máquina, crie o arquivo `.env.local` na raiz (veja modelo seguro em `.env.example`):
- `VITE_SUPABASE_URL`: URL do projeto no painel do Supabase.
- `VITE_SUPABASE_ANON_KEY`: Anon Public Key do Supabase.
- `VITE_ML_CLIENT_ID`: App ID gerado no DevCenter do Mercado Livre.
- `VITE_ML_CLIENT_SECRET`: Secret Key gerada no DevCenter do Mercado Livre.
- `VITE_ML_REDIRECT_URI`: `https://amaroemateu.vercel.app/estoque`

*Observação: As credenciais do App ML também podem ser editadas diretamente na interface do sistema em Estoque ➔ Anúncios Mercado Livre ➔ ⚙️ App ML.*

---

## 4. Estado das Migrações no Supabase

- **Migrações Aplicadas**:
  - `marketplace_tokens`: Armazena os tokens de acesso e refresh OAuth por empresa/plataforma.
  - `marketplace_listings`: Armazena os anúncios e variações sincronizados do ML, seus preços e vínculos com FTs.
  - Arquivo de referência: `supabase/migrations/20261109193000_create_ml_integration_tables.sql`.

---

## 5. Branches do Git

- **`main` (Atual)**:
  - Contém a integração oficial completa do Mercado Livre (Estoque, Variações, SKUs, Vendas do mês, cálculo de margem/lucro sobre o valor real e proxy CORS).
  - É a branch vinculada ao deploy contínuo na Vercel.
- **`feat/simulador-promocoes-ads`**:
  - Contém o simulador de promoções e Product Ads com responsividade vertical ajustada para viewports estreitos.
  - Pausada e commitada com segurança para retorno posterior.

---

## 6. Próximos Passos Recomendados

1. **Shopee**:
   - Implementar a integração oficial ou módulo de importação de anúncios/vendas para a Shopee nos mesmos moldes estabelecidos para o Mercado Livre.
2. **Retomar Simulador de Promoções**:
   - Fazer o merge ou rebase da branch `feat/simulador-promocoes-ads` quando for oportuno.
