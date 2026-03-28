# Finance Atlas Web (Front-end)

Front-end em Vue 3 + Vite consumindo a API Laravel da pasta `../Back-end`.

## Stack

- Vue 3
- Vue Router
- Pinia
- Chart.js
- Axios
- Vite

## Configuracao

Copie o arquivo de exemplo de ambiente:

```powershell
Copy-Item .env.example .env
```

Valores padrao:

- `VITE_API_BASE_URL=/api`
- `VITE_BACKEND_URL=http://127.0.0.1:8000`

O Vite usa proxy de `/api` para `VITE_BACKEND_URL` no ambiente local.

## Rodar localmente

Pre-requisitos:

- Node.js 20+
- NPM 10+

```powershell
npm install
npm run dev
```

Front-end em: `http://127.0.0.1:5173`

