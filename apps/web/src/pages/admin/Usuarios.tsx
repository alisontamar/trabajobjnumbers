import { useEffect, useState, type FormEvent } from 'react'
import type { Rol, Sucursal } from '@crm/shared'
import { useAuth } from '../../context/AuthContext'
import { engine } from '../../lib/engine'
import { supabase } from '../../lib/supabase'

interface Usuario {
  user_id: string
  email: string | null
  rol: Rol
  id_sucursal: string | null
  nombre: string | null
  creado_en: string
}

const etiquetaRol: Record<Rol, string> = {
  admin: 'Superadmin',
  supervisor: 'Admin de sucursal',
  cajero: 'Cajero',
}

export default function Usuarios() {
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'admin'

  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<Rol>('cajero')
  const [idSucursal, setIdSucursal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    setCargando(true)
    try {
      const { usuarios } = await engine.listarUsuarios()
      setUsuarios(usuarios)
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo cargar la lista de usuarios')
    }
    setCargando(false)
  }

  useEffect(() => {
    void cargar()
    supabase
      .from('sucursales')
      .select('*')
      .order('nombre')
      .then(({ data }) => setSucursales((data as Sucursal[]) ?? []))
    if (!esAdmin && perfil?.id_sucursal) setIdSucursal(perfil.id_sucursal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAdmin, perfil?.id_sucursal])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMsg(null)

    if (!esAdmin && rol !== 'cajero') {
      setError('Solo puedes crear cuentas de cajero.')
      return
    }
    if (rol !== 'admin' && !idSucursal) {
      setError('Selecciona una sucursal.')
      return
    }

    setGuardando(true)
    try {
      await engine.crearUsuario({
        email: email.trim(),
        password,
        nombre: nombre.trim(),
        rol,
        id_sucursal: rol === 'admin' ? null : idSucursal,
      })
      setMsg('Cuenta creada correctamente.')
      setEmail('')
      setPassword('')
      setNombre('')
      await cargar()
    } catch (e: any) {
      setError(e?.message ?? 'Error al crear la cuenta')
    }
    setGuardando(false)
  }

  const nombreSucursal = (id: string | null) =>
    sucursales.find((s) => s.id === id)?.nombre ?? id ?? '—'

  return (
    <div className="space-y-6">
      <section className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold text-slate-900 mb-1">Nueva cuenta</h2>
        <p className="text-sm text-slate-500 mb-4">
          {esAdmin
            ? 'Como superadmin puedes crear superadmins, admins de sucursal o cajeros.'
            : 'Puedes crear cuentas de cajero para tu sucursal.'}
        </p>

        <form onSubmit={onSubmit} className="grid sm:grid-cols-2 gap-3 max-w-xl">
          <label className="block text-sm">
            <span className="text-slate-600">Nombre</span>
            <input
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Password provisional</span>
            <input
              required
              type="text"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Rol</span>
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value as Rol)}
              disabled={!esAdmin}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white disabled:bg-slate-100"
            >
              <option value="cajero">Cajero</option>
              {esAdmin && <option value="supervisor">Admin de sucursal</option>}
              {esAdmin && <option value="admin">Superadmin</option>}
            </select>
          </label>

          {rol !== 'admin' && (
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Sucursal</span>
              <select
                value={idSucursal}
                onChange={(e) => setIdSucursal(e.target.value)}
                disabled={!esAdmin}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white disabled:bg-slate-100"
              >
                <option value="">Selecciona…</option>
                {(esAdmin
                  ? sucursales
                  : sucursales.filter((s) => s.id === perfil?.id_sucursal)
                ).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          {msg && <p className="text-sm text-green-600 sm:col-span-2">{msg}</p>}

          <button
            type="submit"
            disabled={guardando}
            className="sm:col-span-2 bg-brand-800 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 w-fit"
          >
            {guardando ? 'Creando…' : 'Crear cuenta'}
          </button>
        </form>
      </section>

      <section className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold text-slate-900 mb-3">
          {esAdmin ? 'Todas las cuentas' : 'Cuentas de tu sucursal'}
        </h2>
        {cargando ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Sucursal</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.user_id} className="border-b last:border-0">
                  <td className="py-2">{u.nombre ?? '—'}</td>
                  <td>{u.email ?? '—'}</td>
                  <td>{etiquetaRol[u.rol]}</td>
                  <td>{u.id_sucursal ? nombreSucursal(u.id_sucursal) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
