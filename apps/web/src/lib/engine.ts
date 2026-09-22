import { supabase } from './supabase'

const BASE = import.meta.env.VITE_ENGINE_URL ?? ''

async function call(path: string, opts: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session?.access_token ?? ''}`,
      ...(opts.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
  return body
}

export const engine = {
  dispararCampana: (id: string) => call(`/campanas/${id}/disparar`, { method: 'POST' }),
  pausarCampana: (id: string) => call(`/campanas/${id}/pausar`, { method: 'POST' }),
  reanudarCampana: (id: string) => call(`/campanas/${id}/reanudar`, { method: 'POST' }),
  reconectarWhatsApp: (idSucursal: string) =>
    call(`/whatsapp/${idSucursal}/reconectar`, { method: 'POST' }),
  reiniciarWhatsApp: (idSucursal: string) =>
    call(`/whatsapp/${idSucursal}/reiniciar`, { method: 'POST' }),
  solicitarCodigoWhatsApp: (idSucursal: string, telefono: string) =>
    call(`/whatsapp/${idSucursal}/codigo`, { method: 'POST', body: JSON.stringify({ telefono }) }),
  crearUsuario: (datos: {
    email: string
    password: string
    nombre: string
    rol: string
    id_sucursal: string | null
  }) => call('/usuarios', { method: 'POST', body: JSON.stringify(datos) }),
  listarUsuarios: () => call('/usuarios'),
}
