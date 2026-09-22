import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Campana, EstadoDestinatario } from '@crm/shared'
import { engine } from '../../lib/engine'
import { supabase } from '../../lib/supabase'

type Fila = Campana & {
  sucursales: { nombre: string } | null
  progreso: Record<EstadoDestinatario | 'total', number>
}

const badge: Record<string, string> = {
  borrador: 'bg-slate-100 text-slate-600',
  en_curso: 'bg-blue-100 text-blue-700',
  pausada: 'bg-amber-100 text-amber-700',
  finalizada: 'bg-green-100 text-green-700',
}

export default function Campanas() {
  const [filas, setFilas] = useState<Fila[]>([])
  const [cargando, setCargando] = useState(true)
  const [accionando, setAccionando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data } = await supabase
      .from('campanas')
      .select('*, sucursales(nombre)')
      .order('creada_en', { ascending: false })

    const conProgreso = await Promise.all(
      ((data as any[]) ?? []).map(async (c) => {
        const { data: dest } = await supabase
          .from('campana_destinatarios')
          .select('estado')
          .eq('id_campana', c.id)
        const progreso: any = { total: dest?.length ?? 0 }
        for (const d of dest ?? []) {
          progreso[d.estado] = (progreso[d.estado] ?? 0) + 1
        }
        return { ...c, progreso }
      }),
    )
    setFilas(conProgreso as Fila[])
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function accion(fn: () => Promise<unknown>, id: string) {
    setError(null)
    setAccionando(id)
    try {
      await fn()
      await cargar()
    } catch (e: any) {
      setError(e?.message ?? 'Error')
    } finally {
      setAccionando(null)
    }
  }

  if (cargando) return <p className="text-slate-500">Cargando…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Campañas</h2>
        <Link
          to="/admin/campanas/nueva"
          className="bg-brand-800 text-white rounded-md px-3 py-2 text-sm font-medium"
        >
          Nueva campaña
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white border rounded-xl divide-y">
        {filas.map((c) => (
          <div key={c.id} className="p-4 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{c.nombre}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${badge[c.estado]}`}
                >
                  {c.estado}
                </span>
                <span className="text-xs text-slate-400">
                  {c.sucursales?.nombre}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {c.progreso.enviado ?? 0}/{c.progreso.total} enviados ·{' '}
                {c.progreso.pendiente ?? 0} pendientes ·{' '}
                {c.progreso.fallido ?? 0} fallidos ·{' '}
                {c.progreso.sin_whatsapp ?? 0} sin WhatsApp
              </p>
            </div>

            <div className="flex gap-2">
              {(c.estado === 'borrador' || c.estado === 'pausada') && (
                <button
                  disabled={accionando === c.id}
                  onClick={() =>
                    accion(() => engine.dispararCampana(c.id), c.id)
                  }
                  className="text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white disabled:opacity-50"
                >
                  {c.estado === 'pausada' ? 'Reanudar envio' : 'Disparar'}
                </button>
              )}
              {c.estado === 'en_curso' && (
                <button
                  disabled={accionando === c.id}
                  onClick={() => accion(() => engine.pausarCampana(c.id), c.id)}
                  className="text-sm px-3 py-1.5 rounded-md bg-amber-500 text-white disabled:opacity-50"
                >
                  Pausar
                </button>
              )}
            </div>
          </div>
        ))}
        {filas.length === 0 && (
          <p className="p-4 text-sm text-slate-400">No hay campañas todavía.</p>
        )}
      </div>
    </div>
  )
}
