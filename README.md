# mini-ecommerce-mfe-admin

Microfrontend do **Mini E-commerce**, carregado pelo [shell](https://github.com/Ruan-Diego/mini-ecommerce-shell) via Module Federation.
Consome o **rotas /admin do backend** pelo [gateway](https://github.com/Ruan-Diego/mini-ecommerce-backend).

React 19 · TypeScript · Vite · `@module-federation/vite`

## Telas

| Rota (relativa ao basePath) | Tela |
| --- | --- |
| `(raiz)` | Painel |
| `produtos` | Produtos |
| `estoque` | Estoque |
| `pedidos` | Pedidos |

Cada tela tem uma issue com tarefas e critério de pronto, e um artboard no canvas de design.

## Contrato com o shell

- Expõe `./App` em `remoteEntry.js` (porta 5178 em dev).
- `./App` recebe `{ basePath, getToken, eventBus }` (veja `src/contracts.ts`).
- Fala com outros microfrontends só por eventos; nunca importa código deles.
- `react`, `react-dom` e `react-router-dom` são compartilhados como singleton.

## Rodando

```bash
pnpm install
pnpm dev        # standalone em http://localhost:5178
pnpm test
pnpm build      # gera dist/remoteEntry.js
```

Para ver dentro do shell, rode `pnpm build && pnpm preview` aqui e `pnpm dev` no shell.
