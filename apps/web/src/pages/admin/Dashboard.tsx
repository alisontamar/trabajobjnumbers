import { useEffect, useState } from 'react'
import type { Sucursal } from '@crm/shared'
import { supabase } from '../../lib/supabase'

interface Stats {
  clientes: number
  porSucursal: { nombre: string; total: number }[]
  campanasEnCurso: number
  enviadosHoy: number
}

export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null)

  useEffect(() => {
    async function cargar() {
      const inicioHoy = new Date()
      inicioHoy.setHours(0, 0, 0, 0)

      const [{ count: clientes }, { data: sucursales }, { count: campanasEnCurso }, { count: enviadosHoy }] =
        await Promise.all([
          supabase.from('clientes').select('id', { count: 'exact', head: true }),
          supabase.from('sucursales').select('*').order('nombre'),
          supabase
            .from('campanas')
            .select('id', { count: 'exact', head: true })
            .eq('estado', 'en_curso'),
          supabase
            .from('campana_destinatarios')
            .select('id', { count: 'exact', head: true })
            .eq('estado', 'enviado')
            .gte('enviado_en', inicioHoy.toISOString()),
        ])

      const porSucursal = await Promise.all(
        ((sucursales as Sucursal[]) ?? []).map(async (su) => {
          const { count } = await supabase
            .from('clientes')
            .select('id', { count: 'exact', head: true })
            .eq('id_sucursal', su.id)
          return { nombre: su.nombre, total: count ?? 0 }
        }),
      )

      setS({
        clientes: clientes ?? 0,
        porSucursal,
        campanasEnCurso: campanasEnCurso ?? 0,
        enviadosHoy: enviadosHoy ?? 0,
      })
    }
    void cargar()
  }, [])

  if (!s) return <p className="text-slate-500">Cargando…</p>

  const Card = ({ label, value }: { label: string; value: number | string }) => (
    <div className="bg-white border rounded-xl p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-1">{value}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card label="Clientes totales" value={s.clientes} />
        <Card label="Campanas en curso" value={s.campanasEnCurso} />
        <Card label="Mensajes enviados hoy" value={s.enviadosHoy} />
      </div>

      <section className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Clientes por sucursal</h2>
        <ul className="divide-y text-sm">
          {s.porSucursal.map((x) => (
            <li key={x.nombre} className="py-2 flex justify-between">
              <span className="text-slate-700">{x.nombre}</span>
              <span className="font-medium text-slate-900">{x.total}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
