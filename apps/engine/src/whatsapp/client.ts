import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from 'baileys'
import type { EstadoConexionWhatsApp } from '@crm/shared'
import { soloDigitos } from '@crm/shared'
import { env } from '../env'
import { logger } from '../logger'
import { supabase } from '../supabase'
import { useSupabaseAuthState, limpiarAuth } from './authState'

type Sock = ReturnType<typeof makeWASocket>

let sock: Sock | null = null
let arrancando = false
let reintentos = 0

export function getSock(): Sock | null {
  return sock
}

export function whatsappConectado(): boolean {
  return !!sock?.user
}

async function setEstado(patch: {
  estado?: EstadoConexionWhatsApp
  qr?: string | null
  numero?: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_estado')
    .upsert({ id: 'default', ...patch, actualizado_en: new Date().toISOString() })
  if (error) logger.error({ err: error }, 'setEstado')
}

export async function startSock(): Promise<void> {
  if (arrancando || sock) return
  arrancando = true
  try {
    const { state, saveCreds } = await useSupabaseAuthState(env.WA_SESSION_ID)
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger as any),
      },
      logger: logger as any,
      printQRInTerminal: false,
      browser: Browsers.appropriate('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (u) => {
      const { connection, lastDisconnect, qr } = u

      if (qr) {
        logger.info('Nuevo QR generado, escanealo desde el panel de WhatsApp')
        await setEstado({ estado: 'esperando_qr', qr })
      }

      if (connection === 'connecting') {
        await setEstado({ estado: 'conectando' })
      }

      if (connection === 'open') {
        reintentos = 0
        const numero =
          sock?.user?.id?.split(':')[0]?.split('@')[0] ?? null
        await setEstado({ estado: 'conectado', qr: null, numero })
        logger.info({ numero }, 'WhatsApp conectado')
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error as any)?.output?.statusCode
        const cerradaSesion = code === DisconnectReason.loggedOut
        sock = null
        await setEstado({ estado: 'desconectado', qr: null })

        if (cerradaSesion) {
          logger.warn('Sesion cerrada (logout). Se limpian credenciales; hace falta re-escanear el QR.')
          await limpiarAuth(env.WA_SESSION_ID)
          return
        }

        reintentos++
        const espera = Math.min(30, 5 * reintentos) * 1000
        logger.warn({ code, reintentos, espera }, 'Conexion cerrada, reintentando')
        setTimeout(() => {
          startSock().catch((e) => logger.error({ err: e }, 'reintento startSock'))
        }, espera)
      }
    })
  } finally {
    arrancando = false
  }
}

/** Reinicia la sesion desde cero (borra credenciales y vuelve a pedir QR). */
export async function reiniciarSesion(): Promise<void> {
  try {
    await sock?.logout()
  } catch {
    /* ignorar */
  }
  sock = null
  await limpiarAuth(env.WA_SESSION_ID)
  await setEstado({ estado: 'desconectado', qr: null, numero: null })
  await startSock()
}

/** Devuelve el JID si el numero tiene WhatsApp, o null si no. */
export async function verificarNumero(e164: string): Promise<string | null> {
  if (!sock) return null
  const [res] = await sock.onWhatsApp(soloDigitos(e164))
  return res?.exists ? res.jid : null
}

export async function enviarTexto(jid: string, texto: string): Promise<void> {
  if (!sock) throw new Error('El socket de WhatsApp no esta conectado')
  await sock.presenceSubscribe(jid).catch(() => {})
  await sock.sendPresenceUpdate('composing', jid).catch(() => {})
  await new Promise((r) => setTimeout(r, 1200 + Math.random() * 1800))
  await sock.sendPresenceUpdate('paused', jid).catch(() => {})
  await sock.sendMessage(jid, { text: texto })
}
