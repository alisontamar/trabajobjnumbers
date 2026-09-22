import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from 'baileys'
import type { EstadoConexionWhatsApp } from '@crm/shared'
import { soloDigitos } from '@crm/shared'
import { logger } from '../logger'
import { supabase } from '../supabase'
import { useSupabaseAuthState, limpiarAuth } from './authState'

type Sock = ReturnType<typeof makeWASocket>

interface Sesion {
  sock: Sock | null
  arrancando: boolean
  reintentos: number
}

const sesiones = new Map<string, Sesion>()

function sesionDe(idSucursal: string): Sesion {
  let s = sesiones.get(idSucursal)
  if (!s) {
    s = { sock: null, arrancando: false, reintentos: 0 }
    sesiones.set(idSucursal, s)
  }
  return s
}

export function getSock(idSucursal: string): Sock | null {
  return sesiones.get(idSucursal)?.sock ?? null
}

export function whatsappConectado(idSucursal: string): boolean {
  return !!sesiones.get(idSucursal)?.sock?.user
}

async function setEstado(
  idSucursal: string,
  patch: { estado?: EstadoConexionWhatsApp; qr?: string | null; numero?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_estado')
    .upsert({ id_sucursal: idSucursal, ...patch, actualizado_en: new Date().toISOString() })
  if (error) logger.error({ err: error, idSucursal }, 'setEstado')
}

export async function startSock(idSucursal: string): Promise<void> {
  const s = sesionDe(idSucursal)
  if (s.arrancando || s.sock) return
  s.arrancando = true
  try {
    const { state, saveCreds } = await useSupabaseAuthState(idSucursal)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
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
    s.sock = sock

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (u) => {
      const { connection, lastDisconnect, qr } = u

      if (qr) {
        logger.info({ idSucursal }, 'Nuevo QR generado, escanealo desde el panel de WhatsApp')
        await setEstado(idSucursal, { estado: 'esperando_qr', qr })
      }

      if (connection === 'connecting') {
        await setEstado(idSucursal, { estado: 'conectando' })
      }

      if (connection === 'open') {
        s.reintentos = 0
        const numero = sock.user?.id?.split(':')[0]?.split('@')[0] ?? null
        await setEstado(idSucursal, { estado: 'conectado', qr: null, numero })
        logger.info({ idSucursal, numero }, 'WhatsApp conectado')
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error as any)?.output?.statusCode
        const cerradaSesion = code === DisconnectReason.loggedOut
        s.sock = null
        await setEstado(idSucursal, { estado: 'desconectado', qr: null })

        if (cerradaSesion) {
          logger.warn({ idSucursal }, 'Sesion cerrada (logout). Se limpian credenciales; hace falta re-escanear el QR.')
          await limpiarAuth(idSucursal)
          return
        }

        s.reintentos++
        const espera = Math.min(30, 5 * s.reintentos) * 1000
        logger.warn({ idSucursal, code, reintentos: s.reintentos, espera }, 'Conexion cerrada, reintentando')
        setTimeout(() => {
          startSock(idSucursal).catch((e) => logger.error({ err: e, idSucursal }, 'reintento startSock'))
        }, espera)
      }
    })
  } finally {
    s.arrancando = false
  }
}

/** Reinicia la sesion de una sucursal desde cero (borra credenciales y vuelve a pedir QR). */
export async function reiniciarSesion(idSucursal: string): Promise<void> {
  const s = sesionDe(idSucursal)
  try {
    await s.sock?.logout()
  } catch {
    /* ignorar */
  }
  s.sock = null
  await limpiarAuth(idSucursal)
  await setEstado(idSucursal, { estado: 'desconectado', qr: null, numero: null })
  await startSock(idSucursal)
}

/**
 * Pide un codigo de 8 caracteres para vincular sin escanear QR (WhatsApp ->
 * Dispositivos vinculados -> Vincular con numero de telefono). Util cuando el
 * celular con el numero lo tiene otra persona: se le dicta el codigo.
 */
export async function solicitarCodigo(idSucursal: string, telefono: string): Promise<string> {
  await startSock(idSucursal)
  const sock = getSock(idSucursal)
  if (!sock) throw new Error('No se pudo iniciar la sesion de WhatsApp')
  if (sock.authState.creds.registered) throw new Error('Esta sucursal ya esta vinculada')

  const numero = soloDigitos(telefono)
  if (!numero) throw new Error('Numero invalido')
  return sock.requestPairingCode(numero)
}

/** Devuelve el JID si el numero tiene WhatsApp, o null si no. */
export async function verificarNumero(idSucursal: string, e164: string): Promise<string | null> {
  const sock = getSock(idSucursal)
  if (!sock) return null
  const [res] = (await sock.onWhatsApp(soloDigitos(e164))) ?? []
  return res?.exists ? res.jid : null
}

export async function enviarTexto(idSucursal: string, jid: string, texto: string): Promise<void> {
  const sock = getSock(idSucursal)
  if (!sock) throw new Error('El socket de WhatsApp no esta conectado')
  await sock.presenceSubscribe(jid).catch(() => {})
  await sock.sendPresenceUpdate('composing', jid).catch(() => {})
  await new Promise((r) => setTimeout(r, 1200 + Math.random() * 1800))
  await sock.sendPresenceUpdate('paused', jid).catch(() => {})
  await sock.sendMessage(jid, { text: texto })
}
