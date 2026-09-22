import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { renderPlantilla, type SegmentoCampana, type Sucursal } from '@crm/shared'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

export default function CampanaNueva() {
  const { session, perfil } = useAuth()
  const nav = useNavigate()
  const esAdmin = perfil?.rol === 'admin'

  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [nombre, setNombre] = useState('')
  const [idSucursal, setIdSucursal] = useState('')
  const [plantilla, setPlantilla] = useState('Hola {nombre}, tenemos una promo para vos 🎉')
  const [enviarATodos, setEnviarATodos] = useState(true)
  const [creadosDesde, setCreadosDesde] = useState('')
  const [creadosHasta, setCreadosHasta] = useState('')
  const [estimado, setEstimado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase
      .from('sucursales')
      .select('*')
      .order('nombre')
      .then(({ data }) => setSucursales((data as Sucursal[]) ?? []))
  }, [])

  useEffect(() => {
    if (!esAdmin && perfil?.id_sucursal) setIdSucursal(perfil.id_sucursal)
  }, [esAdmin, perfil?.id_sucursal])

  function segmento(): SegmentoCampana {
    if (enviarATodos) return {}
    const s: SegmentoCampana = {}
    if (creadosDesde) s.creados_desde = new Date(creadosDesde).toISOString()
    if (creadosHasta) s.creados_hasta = new Date(creadosHasta).toISOString()
    return s
  }

  async function estimar() {
    setError(null)
    const suc = idSucursal || perfil?.id_sucursal
    if (!suc) {
      setError('Selecciona una sucursal.')
      return
    }
    let q = supabase
      .from('clientes')
      .select('id', { count: 'exact', head: true })
      .eq('id_sucursal', suc)
      .eq('estado', 'activo')
      .eq('consentimiento', true)
    const s = segmento()
    if (s.creados_desde) q = q.gte('creado_en', s.creados_desde)
    if (s.creados_hasta) q = q.lte('creado_en', s.creados_hasta)
    const { count } = await q
    setEstimado(count ?? 0)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const suc = idSucursal || perfil?.id_sucursal
    if (!suc) {
      setError('Selecciona una sucursal.')
      return
    }
    setGuardando(true)
    const { error: err } = await supabase.from('campanas').insert({
      nombre: nombre.trim(),
      id_sucursal: suc,
      plantilla_texto: plantilla,
      segmento: segmento(),
      estado: 'borrador',
      creada_por: session?.user.id,
    })
    setGuardando(false)
    if (err) {
      setError(err.message)
      return
    }
    nav('/admin/campanas')
  }

  const preview = renderPlantilla(plantilla, { nombre: 'Maria', sucursal: 'Central' })

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <h2 className="font-semibold text-slate-900">Nueva campaña</h2>

      <label className="block text-sm">
        <span className="text-slate-600">Nombre interno</span>
        <input
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-sm">
        <span className="text-slate-600">Sucursal (segmento)</span>
        <select
          value={idSucursal}
          onChange={(e) => setIdSucursal(e.target.value)}
          disabled={!esAdmin}
          className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white disabled:bg-slate-100"
        >
          <option value="">Selecciona…</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enviarATodos}
          onChange={(e) => setEnviarATodos(e.target.checked)}
        />
        <span className="text-slate-600">
          Enviar a todos los destinatarios registrados de la sucursal
        </span>
      </label>

      {!enviarATodos && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-slate-600">Registrados desde</span>
            <input
              type="date"
              value={creadosDesde}
              onChange={(e) => setCreadosDesde(e.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">hasta</span>
            <input
              type="date"
              value={creadosHasta}
              onChange={(e) => setCreadosHasta(e.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            />
          </label>
        </div>
      )}

      <label className="block text-sm">
        <span className="text-slate-600">
          Mensaje — usa <code className="bg-slate-100 px-1">{'{nombre}'}</code> y{' '}
          <code className="bg-slate-100 px-1">{'{sucursal}'}</code>
        </span>
        <textarea
          required
          rows={4}
          value={plantilla}
          onChange={(e) => setPlantilla(e.target.value)}
          className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
        />
      </label>

      <div className="bg-slate-50 border rounded-md p-3 text-sm text-slate-600">
        <span className="text-xs uppercase tracking-wide text-slate-400">
          Vista previa
        </span>
        <p className="mt-1 whitespace-pre-wrap">{preview}</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void estimar()}
          className="text-sm px-3 py-2 rounded-md border"
        >
          Estimar destinatarios
        </button>
        {estimado !== null && (
          <span className="text-sm text-slate-600">
            ~{estimado} clientes con consentimiento
          </span>
        )}
      </div>

      <button
        type="submit"
        disabled={guardando}
        className="bg-brand-800 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {guardando ? 'Guardando…' : 'Guardar borrador'}
      </button>
    </form>
  )
}
