import { useEffect, useRef, useState, type FormEvent } from 'react'
import { normalizarCelularBO, type Cliente, type Sucursal } from '@crm/shared'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Caja() {
  const { session, perfil } = useAuth()
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [nombre, setNombre] = useState('')
  const [celular, setCelular] = useState('')
  const [idSucursal, setIdSucursal] = useState('')
  const [consentimiento, setConsentimiento] = useState(true)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [recientes, setRecientes] = useState<Cliente[]>([])
  const nombreRef = useRef<HTMLInputElement>(null)

  const fijaSucursal = perfil?.rol !== 'admin'

  useEffect(() => {
    supabase
      .from('sucursales')
      .select('*')
      .order('nombre')
      .then(({ data }) => setSucursales((data as Sucursal[]) ?? []))
  }, [])

  useEffect(() => {
    if (fijaSucursal && perfil?.id_sucursal) setIdSucursal(perfil.id_sucursal)
  }, [fijaSucursal, perfil?.id_sucursal])

  async function cargarRecientes() {
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(10)
    setRecientes((data as Cliente[]) ?? [])
  }
  useEffect(() => {
    void cargarRecientes()
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)

    const e164 = normalizarCelularBO(celular)
    if (!e164) {
      setMsg({ tipo: 'error', texto: 'Celular invalido. Debe ser un movil de Bolivia (8 digitos, empieza con 6 o 7).' })
      return
    }
    const sucursal = idSucursal || perfil?.id_sucursal
    if (!sucursal) {
      setMsg({ tipo: 'error', texto: 'Selecciona una sucursal.' })
      return
    }

    setGuardando(true)
    const { error } = await supabase.from('clientes').insert({
      nombre: nombre.trim(),
      celular_e164: e164,
      id_sucursal: sucursal,
      consentimiento,
      consent_fecha: consentimiento ? new Date().toISOString() : null,
      creado_por: session?.user.id,
    })
    setGuardando(false)

    if (error) {
      setMsg({
        tipo: 'error',
        texto:
          error.code === '23505'
            ? 'Ese celular ya esta registrado.'
            : error.message,
      })
      return
    }

    setMsg({ tipo: 'ok', texto: `Cliente "${nombre.trim()}" registrado.` })
    setNombre('')
    setCelular('')
    setConsentimiento(true)
    nombreRef.current?.focus()
    void cargarRecientes()
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,380px)_1fr]">
      <section className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold text-slate-900 mb-4">Registrar cliente</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-sm">
            <span className="text-slate-600">Nombre</span>
            <input
              ref={nombreRef}
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              autoFocus
            />
          </label>

          <label className="block text-sm">
            <span className="text-slate-600">Celular</span>
            <input
              required
              inputMode="tel"
              placeholder="7XXXXXXX"
              value={celular}
              onChange={(e) => setCelular(e.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="text-slate-600">Sucursal</span>
            <select
              value={idSucursal}
              onChange={(e) => setIdSucursal(e.target.value)}
              disabled={fijaSucursal}
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

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={consentimiento}
              onChange={(e) => setConsentimiento(e.target.checked)}
            />
            El cliente acepta recibir mensajes por WhatsApp
          </label>

          {msg && (
            <p
              className={`text-sm ${
                msg.tipo === 'ok' ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {msg.texto}
            </p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </section>

      <section className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold text-slate-900 mb-4">Ultimos registrados</h2>
        <ul className="divide-y text-sm">
          {recientes.map((c) => (
            <li key={c.id} className="py-2 flex items-center justify-between">
              <span className="font-medium text-slate-800">{c.nombre}</span>
              <span className="text-slate-500">{c.celular_e164}</span>
            </li>
          ))}
          {recientes.length === 0 && (
            <li className="py-2 text-slate-400">Sin registros todavia.</li>
          )}
        </ul>
      </section>
    </div>
  )
}
