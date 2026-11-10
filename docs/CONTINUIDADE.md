# Guia de Continuidade do Projeto - AM3D Soluções (amaroemateu)

Este documento registra o estado atual do sistema, decisões de arquitetura, configurações de ambiente e o guia para retomar o trabalho em outra máquina ou na próxima sessão.

---

## 1. Resumo da Arquitetura e Módulos

O sistema é uma aplicação SPA moderna em **React + Vite**, hospedada na **Vercel** e conectada ao **Supabase** (PostgreSQL com Row Level Security):

- **Fichas Técnicas (`src/pages/FichasTecnicas.jsx`)**: Cadastro completo de peças, insumos, peso, tempos, custos e campo **SKU do Produto**.
- **Controle de Estoque (`src/pages/Estoque.jsx`)**:
  - Aba *Estoque Físico*: controle duplo (Galpão vs Casa), suporte a variações de estoque (`variacoesEstoque`) e botões *Igualar* com anúncios do Mercado Livre e da Shopee.
  - Aba *Anúncios Mercado Livre*: visualização dos 60 anúncios sincronizados da conta `AMAROEMATEU3D`, suporte a variações expansíveis, atualização de estoque em tempo real e status ativo/pausado.
  - Aba *Anúncios Shopee*: integração oficial Shopee API v2 com o app `Controle AM3D` (App ID 250355), suporte a modelos/variações, sincronização de anúncios, atualização de estoque e status.
- **Vendas Multi-Canal (`src/pages/Vendas.jsx`)**:
  - Precificação por canal (Mercado Livre, Shopee, Amazon, TikTok, Site Próprio).
  - Tabela com colunas de Cadastro (markup 30%), Venda (ideal) e Queima (break-even).
  - Botão **📦 Puxar Vendas ML**: agrupa pedidos pagos do mês por FT, permite vincular itens na 1ª vez via `MlFtMappingModal`, exibe o valor real praticado no marketplace e calcula **% Margem** e **Lucro Líquido** com base no valor real de venda.
  - Botão **🛍️ Puxar Vendas Shopee**: consulta pedidos pagos em dois blocos de 15 dias (regra da API Shopee), agrupa itens e modelos vendidos, permite vinculação de 1ª vez e calcula o lucro real.
- **Backend / Serverless (`api/mlproxy.js`, `api/shopeeproxy.js` e `vite.config.js`)**:
  - Proxy para contorno de CORS da API do Mercado Livre e da Shopee API v2 (com assinatura HMAC-SHA256 automática).
- **Serviços de Integração**:
  - Mercado Livre: `src/services/mercadolivre.js`
  - Shopee: `src/services/shopee.js`

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

## 6. Lembretes Imediatos para a Próxima Sessão

- [ ] **Aguardar Aprovação Go-Live da Shopee**:
  - O pedido Go-Live do App `Controle AM3D` (App ID `250355`) foi submetido com sucesso no console da Shopee em 10/11/2026.
  - A Shopee analisa e emite o Live Partner ID e Live Partner Key em até 24h.
  - Ao receber, preencher no modal da aplicação (Estoque ➔ Anúncios Shopee ➔ ⚙️ App Shopee) ou nas variáveis de ambiente na Vercel (`VITE_SHOPEE_PARTNER_ID`, `VITE_SHOPEE_PARTNER_KEY`).

## 7. Próximos Passos Recomendados

1. **Shopee Go-Live**: Conectar a loja do vendedor na Shopee assim que as chaves de produção forem liberadas.
2. **Retomar Simulador de Promoções**: Fazer o merge ou rebase da branch `feat/simulador-promocoes-ads` quando for oportuno.
