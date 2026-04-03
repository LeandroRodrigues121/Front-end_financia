import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const LOCAL_BACKEND_URL = 'http://127.0.0.1:8000'

function resolveBackendUrl(env) {
  const configuredBackendUrl = env.VITE_BACKEND_URL?.trim() || LOCAL_BACKEND_URL

  try {
    const url = new URL(configuredBackendUrl)
    const isLocalHost = ['127.0.0.1', 'localhost'].includes(url.hostname)
    const isDockerPort = url.port === '10000'
    const allowDockerPort = env.VITE_BACKEND_URL_ALLOW_LOCAL_10000 === 'true'

    if (isLocalHost && isDockerPort && !allowDockerPort) {
      console.warn(
        '[vite] Ignorando VITE_BACKEND_URL local apontando para :10000 e usando http://127.0.0.1:8000. ' +
        'A porta 10000 e usada no container/deploy; para usar 10000 localmente de proposito, defina ' +
        'VITE_BACKEND_URL_ALLOW_LOCAL_10000=true.'
      )

      return LOCAL_BACKEND_URL
    }
  } catch (error) {
    console.warn(`[vite] VITE_BACKEND_URL invalida (${configuredBackendUrl}). Usando ${LOCAL_BACKEND_URL}.`)

    return LOCAL_BACKEND_URL
  }

  return configuredBackendUrl
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = resolveBackendUrl(env)

  return {
    plugins: [
      vue(),
      vueDevTools(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
  }
})
