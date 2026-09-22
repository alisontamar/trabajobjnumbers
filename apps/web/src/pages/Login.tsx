import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setCargando(true)
    try {
      await signIn(email.trim(), password)
      nav('/', { replace: true })
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo iniciar sesion')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white border rounded-xl p-6 space-y-4"
      >
        <div className="flex flex-col items-center text-center">
          <img src="/logo-bj.png" alt="BJ Promociones" className="h-16 w-auto mb-2" />
          <h1 className="text-lg font-semibold text-slate-900">BJ Promociones</h1>
          <p className="text-sm text-slate-500">Inicia sesion para continuar</p>
        </div>

        <label className="block text-sm">
          <span className="text-slate-600">Correo</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            autoFocus
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-600">Contrasena</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={cargando}
          className="w-full bg-brand-800 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50 hover:bg-brand-900"
        >
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
