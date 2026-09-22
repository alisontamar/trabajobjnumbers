import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Layout() {
  const { perfil, session, signOut } = useAuth()
  const loc = useLocation()
  const isAdmin = perfil?.rol === 'admin'
  const isSup = perfil?.rol === 'supervisor' || isAdmin

  const link = (to: string, label: string) => (
    <Link
      to={to}
      className={`px-3 py-2 rounded-md text-sm font-medium transition ${
        loc.pathname === to
          ? 'bg-brand-800 text-white'
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="max-w-5xl mx-auto flex items-center gap-1 px-4 h-14">
          <img src="/logo-bj.png" alt="BJ Promociones" className="h-9 w-auto mr-2" />
          <span className="font-semibold mr-3">BJ Promociones</span>
          {link('/caja', 'Caja')}
          {isSup && link('/admin', 'Panel')}
          {isSup && link('/admin/campanas', 'Campañas')}
          {isSup && link('/admin/whatsapp', 'WhatsApp')}
          {isSup && link('/admin/usuarios', 'Usuarios')}
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
            <span className="hidden sm:inline">
              {session?.user.email} · {perfil?.rol ?? 'sin rol'}
            </span>
            <button
              onClick={() => void signOut()}
              className="text-slate-600 hover:text-slate-900 font-medium"
            >
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4">
        <Outlet />
      </main>
    </div>
  )
}
