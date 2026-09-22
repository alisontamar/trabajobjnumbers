import express, { type NextFunction, type Request, type Response } from 'express'
import type { Rol, SegmentoCampana } from '@crm/shared'
import { env } from '../env'
import { logger } from '../logger'
import { supabase } from '../supabase'
import {
  getSock,
  reiniciarSesion,
  solicitarCodigo,
  startSock,
  whatsappConectado,
} from '../whatsapp/client'

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

// --------------------------------------------------------------------- auth
interface ReqAuth extends Request {
  userId?: string
  perfil?: { rol: Rol; id_sucursal: string | null }
}

/** Verifica el token y adjunta el perfil (rol + sucursal) del usuario. */
async function autenticar(req: ReqAuth, res: Response, next: NextFunction) {
  try {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'Falta token' })

    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return res.status(401).json({ error: 'Token invalido' })

    const { data: perfil } = await supabase
      .from('perfiles')
      .select('rol, id_sucursal')
      .eq('user_id', data.user.id)
      .maybeSingle()

    if (!perfil) return res.status(403).json({ error: 'Usuario sin perfil' })

    req.userId = data.user.id
    req.perfil = perfil as { rol: Rol; id_sucursal: string | null }
    next()
  } catch (e) {
    logger.error({ err: e }, 'autenticar')
    res.status(500).json({ error: 'Error de autenticacion' })
  }
}

/**
 * admin        -> gestiona cualquier sucursal
 * supervisor   -> solo gestiona SU sucursal (comparar contra idSucursal)
 * cajero       -> nunca gestiona WhatsApp/campanas
 */
function puedeGestionar(perfil: ReqAuth['perfil'], idSucursal: string): boolean {
  if (!perfil) return false
  if (perfil.rol === 'admin') return true
  return perfil.rol === 'supervisor' && perfil.id_sucursal === idSucursal
}

function requiereGestionDeSucursal(idSucursal: string) {
  return (req: ReqAuth, res: Response, next: NextFunction) => {
    if (!puedeGestionar(req.perfil, idSucursal)) {
      return res.status(403).json({ error: 'No tienes permiso sobre esta sucursal' })
    }
    next()
  }
}

// -------------------------------------------------------------------- rutas
app.get('/health', async (_req, res) => {
  const { data: sucursales } = await supabase.from('sucursales').select('id, nombre')
  const whatsapp = (sucursales ?? []).map((s) => ({
    id_sucursal: s.id,
    nombre: s.nombre,
    conectado: whatsappConectado(s.id),
  }))
  res.json({ ok: true, whatsapp })
})

/** Genera la cola de destinatarios y pone la campana en curso. */
app.post('/campanas/:id/disparar', autenticar, async (req: ReqAuth, res: Response) => {
  const id = req.params.id

  const { data: campana, error: eCamp } = await supabase
    .from('campanas')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (eCamp) return res.status(500).json({ error: eCamp.message })
  if (!campana) return res.status(404).json({ error: 'La campana no existe' })
  if (!puedeGestionar(req.perfil, campana.id_sucursal)) {
    return res.status(403).json({ error: 'No tienes permiso sobre esta sucursal' })
  }
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

app.post('/campanas/:id/pausar', autenticar, async (req: ReqAuth, res: Response) => {
  const { data: campana } = await supabase
    .from('campanas')
    .select('id_sucursal')
    .eq('id', req.params.id)
    .maybeSingle()
  if (!campana) return res.status(404).json({ error: 'La campana no existe' })
  if (!puedeGestionar(req.perfil, campana.id_sucursal)) {
    return res.status(403).json({ error: 'No tienes permiso sobre esta sucursal' })
  }

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

app.post('/campanas/:id/reanudar', autenticar, async (req: ReqAuth, res: Response) => {
  const { data: campana } = await supabase
    .from('campanas')
    .select('id_sucursal')
    .eq('id', req.params.id)
    .maybeSingle()
  if (!campana) return res.status(404).json({ error: 'La campana no existe' })
  if (!puedeGestionar(req.perfil, campana.id_sucursal)) {
    return res.status(403).json({ error: 'No tienes permiso sobre esta sucursal' })
  }

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

app.post(
  '/whatsapp/:idSucursal/reconectar',
  autenticar,
  (req: ReqAuth, res: Response, next: NextFunction) =>
    requiereGestionDeSucursal(req.params.idSucursal)(req, res, next),
  async (req: ReqAuth, res: Response) => {
    const { idSucursal } = req.params
    if (!getSock(idSucursal)) await startSock(idSucursal)
    res.json({ ok: true })
  },
)

app.post(
  '/whatsapp/:idSucursal/codigo',
  autenticar,
  (req: ReqAuth, res: Response, next: NextFunction) =>
    requiereGestionDeSucursal(req.params.idSucursal)(req, res, next),
  async (req: ReqAuth, res: Response) => {
    const { idSucursal } = req.params
    const { telefono } = req.body ?? {}
    if (!telefono) return res.status(400).json({ error: 'Falta el telefono' })
    try {
      const codigo = await solicitarCodigo(idSucursal, telefono)
      res.json({ ok: true, codigo })
    } catch (e: any) {
      res.status(400).json({ error: e?.message ?? 'No se pudo generar el codigo' })
    }
  },
)

app.post(
  '/whatsapp/:idSucursal/reiniciar',
  autenticar,
  (req: ReqAuth, res: Response, next: NextFunction) =>
    requiereGestionDeSucursal(req.params.idSucursal)(req, res, next),
  async (req: ReqAuth, res: Response) => {
    const { idSucursal } = req.params
    await reiniciarSesion(idSucursal)
    await supabase.from('auditoria').insert({
      user_id: req.userId,
      accion: 'reiniciar_whatsapp',
      detalle: { id_sucursal: idSucursal },
    })
    res.json({ ok: true })
  },
)

/** Crea una cuenta (Auth + perfil). admin: cualquier rol/sucursal. supervisor: solo cajero de su sucursal. */
app.post('/usuarios', autenticar, async (req: ReqAuth, res: Response) => {
  const { email, password, nombre, rol, id_sucursal } = req.body ?? {}

  if (!email || !password || !rol) {
    return res.status(400).json({ error: 'Faltan email, password o rol' })
  }
  if (!['cajero', 'supervisor', 'admin'].includes(rol)) {
    return res.status(400).json({ error: 'Rol invalido' })
  }

  let idSucursalFinal: string | null = null

  if (req.perfil?.rol === 'admin') {
    if (rol !== 'admin') {
      if (!id_sucursal) return res.status(400).json({ error: 'Falta id_sucursal' })
      idSucursalFinal = id_sucursal
    }
  } else if (req.perfil?.rol === 'supervisor') {
    if (rol !== 'cajero') {
      return res.status(403).json({ error: 'Solo puedes crear cuentas de cajero' })
    }
    idSucursalFinal = req.perfil.id_sucursal
  } else {
    return res.status(403).json({ error: 'No tienes permiso para crear usuarios' })
  }

  const { data: creado, error: eAuth } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (eAuth || !creado.user) {
    return res.status(400).json({ error: eAuth?.message ?? 'No se pudo crear el usuario' })
  }

  const { error: ePerfil } = await supabase.from('perfiles').insert({
    user_id: creado.user.id,
    rol,
    id_sucursal: idSucursalFinal,
    nombre: nombre ?? null,
  })
  if (ePerfil) {
    await supabase.auth.admin.deleteUser(creado.user.id)
    return res.status(500).json({ error: ePerfil.message })
  }

  await supabase.from('auditoria').insert({
    user_id: req.userId,
    accion: 'crear_usuario',
    detalle: { creado: creado.user.id, rol, id_sucursal: idSucursalFinal },
  })

  logger.info({ userId: creado.user.id, rol, idSucursalFinal }, 'usuario creado')
  res.json({ ok: true, user_id: creado.user.id })
})

/** Lista las cuentas visibles: admin ve todas, supervisor solo las de su sucursal. */
app.get('/usuarios', autenticar, async (req: ReqAuth, res: Response) => {
  let q = supabase.from('perfiles').select('user_id, rol, id_sucursal, nombre, creado_en')

  if (req.perfil?.rol === 'admin') {
    // sin filtro: ve todas las sucursales
  } else if (req.perfil?.rol === 'supervisor' && req.perfil.id_sucursal) {
    q = q.eq('id_sucursal', req.perfil.id_sucursal)
  } else {
    return res.status(403).json({ error: 'No tienes permiso para ver usuarios' })
  }

  const { data: perfiles, error } = await q.order('creado_en', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  const usuarios = await Promise.all(
    (perfiles ?? []).map(async (p) => {
      const { data } = await supabase.auth.admin.getUserById(p.user_id)
      return { ...p, email: data.user?.email ?? null }
    }),
  )

  res.json({ ok: true, usuarios })
})

export function startApi(): void {
  app.listen(env.PORT, () => logger.info(`API escuchando en :${env.PORT}`))
}
