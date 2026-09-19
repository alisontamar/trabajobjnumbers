import { env } from './env'
import { logger } from './logger'
import { startApi } from './api/server'
import { startWorker } from './queue/worker'
import { startSock } from './whatsapp/client'

async function main() {
  logger.info(
    { sesion: env.WA_SESSION_ID, puerto: env.PORT, origenes: env.ADMIN_ORIGINS },
    'Arrancando engine de difusion',
  )

  // 1) API HTTP (siempre disponible aunque WhatsApp no conecte)
  startApi()

  // 2) Conexion a WhatsApp (persiste el QR/estado en Supabase)
  await startSock().catch((e) => logger.error({ err: e }, 'startSock inicial'))

  // 3) Worker que consume la cola con pausas humanas
  startWorker()
}

main().catch((e) => {
  logger.error({ err: e }, 'fallo fatal al arrancar')
  process.exit(1)
})

process.on('unhandledRejection', (e) => logger.error({ err: e }, 'unhandledRejection'))
process.on('uncaughtException', (e) => logger.error({ err: e }, 'uncaughtException'))
