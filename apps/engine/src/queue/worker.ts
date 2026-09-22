import { renderPlantilla, type ConfigEnvio } from '@crm/shared'
import { env } from '../env'
import { logger } from '../logger'
import { supabase } from '../supabase'
import { enviarTexto, verificarNumero, whatsappConectado } from '../whatsapp/client'

const MAX_INTENTOS = 3

const activos = new Map<string, boolean>()

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}

function horaLocal(): number {
  const h = new Date().getUTCHours() + env.HORARIO_TZ_OFFSET
  return ((h % 24) + 24) % 24
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

async function getConfig(idSucursal: string): Promise<ConfigEnvio | null> {
  const { data, error } = await supabase
    .from('config_envio')
    .select('*')
    .eq('id_sucursal', idSucursal)
    .maybeSingle()
  if (error) {
    logger.error({ err: error, idSucursal }, 'getConfig')
    return null
  }
  return data as ConfigEnvio | null
}

/** Marca como 'finalizada' toda campana en curso de la sucursal que ya no tiene pendientes. */
async function finalizarCampanasVacias(idSucursal: string): Promise<void> {
  const { data: enCurso } = await supabase
    .from('campanas')
    .select('id')
    .eq('id_sucursal', idSucursal)
    .eq('estado', 'en_curso')

  for (const c of enCurso ?? []) {
    const { count } = await supabase
      .from('campana_destinatarios')
      .select('id', { count: 'exact', head: true })
      .eq('id_campana', c.id)
      .eq('estado', 'pendiente')
    if ((count ?? 0) === 0) {
      await supabase.from('campanas').update({ estado: 'finalizada' }).eq('id', c.id)
      logger.info({ campana: c.id, idSucursal }, 'Campana finalizada')
    }
  }
}

/** Toma el siguiente destinatario pendiente de campanas en curso de esta sucursal. */
async function tomarSiguiente(idSucursal: string) {
  const { data, error } = await supabase
    .from('campana_destinatarios')
    .select('*, campanas!inner(id, estado, plantilla_texto, id_sucursal, sucursales(nombre))')
    .eq('estado', 'pendiente')
    .eq('campanas.estado', 'en_curso')
    .eq('campanas.id_sucursal', idSucursal)
    .order('creado_en', { ascending: true })
    .limit(1)
  if (error) {
    logger.error({ err: error, idSucursal }, 'tomarSiguiente')
    return null
  }
  return data?.[0] ?? null
}

async function procesar(
  idSucursal: string,
  dest: any,
): Promise<'enviado' | 'omitido' | 'sin_whatsapp' | 'fallido' | 'reintentar'> {
  const campana = dest.campanas
  const { data: cliente } = await supabase
    .from('clientes')
    .select('nombre, estado')
    .eq('id', dest.id_cliente)
    .maybeSingle()

  const { data: optOut } = await supabase
    .from('opt_outs')
    .select('celular_e164')
    .eq('celular_e164', dest.celular_snapshot)
    .maybeSingle()

  if (!cliente || cliente.estado === 'baja' || optOut) {
    await supabase
      .from('campana_destinatarios')
      .update({ estado: 'omitido', enviado_en: new Date().toISOString() })
      .eq('id', dest.id)
    return 'omitido'
  }

  const jid = await verificarNumero(idSucursal, dest.celular_snapshot)
  if (!jid) {
    await supabase
      .from('campana_destinatarios')
      .update({ estado: 'sin_whatsapp', intento: dest.intento + 1 })
      .eq('id', dest.id)
    return 'sin_whatsapp'
  }

  const texto = renderPlantilla(campana.plantilla_texto, {
    nombre: cliente.nombre,
    sucursal: campana.sucursales?.nombre ?? null,
  })

  try {
    await enviarTexto(idSucursal, jid, texto)
    await supabase
      .from('campana_destinatarios')
      .update({
        estado: 'enviado',
        intento: dest.intento + 1,
        enviado_en: new Date().toISOString(),
        error: null,
      })
      .eq('id', dest.id)
    return 'enviado'
  } catch (e: any) {
    const intento = dest.intento + 1
    const agotado = intento >= MAX_INTENTOS
    await supabase
      .from('campana_destinatarios')
      .update({
        estado: agotado ? 'fallido' : 'pendiente',
        intento,
        error: String(e?.message ?? e).slice(0, 500),
      })
      .eq('id', dest.id)
    logger.warn({ dest: dest.id, idSucursal, intento, err: e?.message }, 'fallo envio')
    return agotado ? 'fallido' : 'reintentar'
  }
}

async function tick(idSucursal: string): Promise<void> {
  const agendar = (ms: number) => {
    if (activos.get(idSucursal)) setTimeout(() => tick(idSucursal), ms)
  }

  try {
    if (!whatsappConectado(idSucursal)) return agendar(15_000)

    const cfg = await getConfig(idSucursal)
    if (!cfg || !cfg.activo) return agendar(30_000)

    const hora = horaLocal()
    if (hora < cfg.hora_inicio || hora >= cfg.hora_fin) return agendar(60_000)

    // Contador diario (por sucursal)
    const hoy = hoyISO()
    let contador = cfg.contador_hoy
    if (cfg.contador_fecha !== hoy) {
      contador = 0
      await supabase
        .from('config_envio')
        .update({ contador_fecha: hoy, contador_hoy: 0 })
        .eq('id_sucursal', idSucursal)
    }
    if (contador >= cfg.tope_diario) {
      logger.info({ idSucursal, contador, tope: cfg.tope_diario }, 'Tope diario alcanzado')
      return agendar(5 * 60_000)
    }

    await finalizarCampanasVacias(idSucursal)

    const dest = await tomarSiguiente(idSucursal)
    if (!dest) return agendar(20_000)

    const resultado = await procesar(idSucursal, dest)

    // Solo un envio real cuenta para el tope y las pausas
    let delay = randInt(cfg.delay_min_seg, cfg.delay_max_seg) * 1000
    if (resultado === 'enviado') {
      await supabase
        .from('config_envio')
        .update({ contador_hoy: contador + 1, contador_fecha: hoy })
        .eq('id_sucursal', idSucursal)
      const pausadasHoy = (contador + 1) % Math.max(cfg.pausa_cada, 1)
      if (cfg.pausa_cada > 0 && pausadasHoy === 0) {
        delay += cfg.pausa_larga_seg * 1000
        logger.info({ idSucursal, seg: cfg.pausa_larga_seg }, 'Pausa larga entre lotes')
      }
    } else {
      // omitido / sin_whatsapp / reintentar: pasar al siguiente mas rapido
      delay = randInt(5, 12) * 1000
    }

    logger.info({ idSucursal, dest: dest.id, resultado, proximoEnMs: delay }, 'destinatario procesado')
    agendar(delay)
  } catch (e) {
    logger.error({ err: e, idSucursal }, 'tick')
    agendar(30_000)
  }
}

/** Arranca el worker de difusion de una sucursal (una cola serial por numero). */
export function startWorker(idSucursal: string): void {
  if (activos.get(idSucursal)) return
  activos.set(idSucursal, true)
  logger.info({ idSucursal }, 'Worker de difusion iniciado')
  setTimeout(() => tick(idSucursal), 3_000)
}

export function stopWorker(idSucursal: string): void {
  activos.set(idSucursal, false)
}
