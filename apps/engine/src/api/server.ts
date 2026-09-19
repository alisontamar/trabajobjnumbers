import express, { type NextFunction, type Request, type Response } from 'express'
import type { SegmentoCampana } from '@crm/shared'
import { env } from '../env'
import { logger } from '../logger'
import { supabase } from '../supabase'
import { getSock, reiniciarSesion, startSock, whatsappConectado } from '../whatsapp/client'

const app = express()
app.use(express.json())

// -------------------------------------------------------------------- CORS
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin
  if (origin && env.ADMIN_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ---------------------------------------------------------- auth: solo admin
interface ReqAdmin extends Request {
  userId?: string
}

async function soloAdmin(req: ReqAdmin, res: Response, next: NextFunction) {
  try {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'Falta token' })

    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return res.status(401).json({ error: 'Token invalido' })

    const { data: perfil } = await supabase
      .from('perfiles')
      .select('rol')
      .eq('user_id', data.user.id)
      .maybeSingle()

    if (perfil?.rol !== 'admin') return res.status(403).json({ error: 'Requiere rol admin' })

    req.userId = data.user.id
    next()
  } catch (e) {
    logger.error({ err: e }, 'soloAdmin')
    res.status(500).json({ error: 'Error de autenticacion' })
  }
}

// -------------------------------------------------------------------- rutas
app.get('/health', (_req, res) => {
  res.json({ ok: true, whatsapp: whatsappConectado() })
})

/** Genera la cola de destinatarios y pone la campana en curso. */
app.post('/campanas/:id/disparar', soloAdmin, async (req: ReqAdmin, res: Response) => {
  const id = req.params.id

  const { data: campana, error: eCamp } = await supabase
    .from('campanas')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (eCamp) return res.status(500).json({ error: eCamp.message })
  if (!campana) return res.status(404).json({ error: 'La campana no existe' })
  if (!['borrador', 'pausada'].includes(campana.estado)) {
    return res.status(409).json({ error: `La campana esta en estado "${campana.estado}"` })
  }

  const seg = (campana.segmento ?? {}) as SegmentoCampana
  let q = supabase
    .from('clientes')
    .select('id, celular_e164')
    .eq('id_sucursal', campana.id_sucursal)
    .eq('estado', 'activo')
    .eq('consentimiento', true)
  if (seg.creados_desde) q = q.gte('creado_en', seg.creados_desde)
  if (seg.creados_hasta) q = q.lte('creado_en', seg.creados_hasta)

  const { data: clientes, error: eCli } = await q
  if (eCli) return res.status(500).json({ error: eCli.message })

  const { data: outs } = await supabase.from('opt_outs').select('celular_e164')
  const outSet = new Set((outs ?? []).map((o) => o.celular_e164))

  const filas = (clientes ?? [])
    .filter((c) => !outSet.has(c.celular_e164))
    .map((c) => ({
      id_campana: id,
      id_cliente: c.id,
      celular_snapshot: c.celular_e164,
      estado: 'pendiente' as const,
    }))

  if (filas.length === 0) {
    return res.status(400).json({ error: 'El segmento no tiene destinatarios validos' })
  }

  const { error: eIns } = await supabase
    .from('campana_destinatarios')
    .upsert(filas, { onConflict: 'id_campana,id_cliente', ignoreDuplicates: true })
  if (eIns) return res.status(500).json({ error: eIns.message })

  await supabase.from('campanas').update({ estado: 'en_curso' }).eq('id', id)
  await supabase.from('auditoria').insert({
    user_id: req.userId,
    accion: 'disparar_campana',
    detalle: { id, destinatarios: filas.length },
  })

  logger.info({ id, destinatarios: filas.length }, 'campana disparada')
  res.json({ ok: true, destinatarios: filas.length })
})

app.post('/campanas/:id/pausar', soloAdmin, async (req: ReqAdmin, res: Response) => {
  const { error } = await supabase
    .from('campanas')
    .update({ estado: 'pausada' })
    .eq('id', req.params.id)
    .eq('estado', 'en_curso')
  if (error) return res.status(500).json({ error: error.message })
  await supabase.from('auditoria').insert({
    user_id: req.userId,
    accion: 'pausar_campana',
    detalle: { id: req.params.id },
  })
  res.json({ ok: true })
})

app.post('/campanas/:id/reanudar', soloAdmin, async (req: ReqAdmin, res: Response) => {
  const { error } = await supabase
    .from('campanas')
    .update({ estado: 'en_curso' })
    .eq('id', req.params.id)
    .in('estado', ['pausada'])
  if (error) return res.status(500).json({ error: error.message })
  await supabase.from('auditoria').insert({
    user_id: req.userId,
    accion: 'reanudar_campana',
    detalle: { id: req.params.id },
  })
  res.json({ ok: true })
})

app.post('/whatsapp/reconectar', soloAdmin, async (_req: ReqAdmin, res: Response) => {
  if (!getSock()) await startSock()
  res.json({ ok: true })
})

app.post('/whatsapp/reiniciar', soloAdmin, async (req: ReqAdmin, res: Response) => {
  await reiniciarSesion()
  await supabase.from('auditoria').insert({
    user_id: req.userId,
    accion: 'reiniciar_whatsapp',
    detalle: {},
  })
  res.json({ ok: true })
})

export function startApi(): void {
  app.listen(env.PORT, () => logger.info(`API escuchando en :${env.PORT}`))
}
