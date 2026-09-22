import { env } from './env'
import { logger } from './logger'
import { supabase } from './supabase'
import { startApi } from './api/server'
import { startWorker } from './queue/worker'
import { startSock } from './whatsapp/client'

async function main() {
  logger.info({ puerto: env.PORT, origenes: env.ADMIN_ORIGINS }, 'Arrancando engine de difusion')

  // 1) API HTTP (siempre disponible aunque WhatsApp no conecte)
  startApi()

  // 2) Una conexion WhatsApp + un worker de cola por cada sucursal
  const { data: sucursales, error } = await supabase.from('sucursales').select('id, nombre')
  if (error) {
    logger.error({ err: error }, 'no se pudieron leer las sucursales')
  }

  for (const s of sucursales ?? []) {
    logger.info({ idSucursal: s.id, nombre: s.nombre }, 'iniciando sesion de sucursal')
    await startSock(s.id).catch((e) => logger.error({ err: e, idSucursal: s.id }, 'startSock inicial'))
    startWorker(s.id)
  }
}

main().catch((e) => {
  logger.error({ err: e }, 'fallo fatal al arrancar')
  process.exit(1)
})

process.on('unhandledRejection', (e) => logger.error({ err: e }, 'unhandledRejection'))
process.on('uncaughtException', (e) => logger.error({ err: e }, 'uncaughtException'))
