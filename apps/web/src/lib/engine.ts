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
  reconectarWhatsApp: () => call('/whatsapp/reconectar', { method: 'POST' }),
  reiniciarWhatsApp: () => call('/whatsapp/reiniciar', { method: 'POST' }),
}
