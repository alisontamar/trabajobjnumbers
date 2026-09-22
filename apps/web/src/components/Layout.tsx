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
      className={`px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition ${
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
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2 space-y-2">
          <div className="flex items-center gap-2">
            <img src="/logo-bj.png" alt="BJ Promociones" className="h-8 w-auto shrink-0" />
            <span className="font-semibold text-sm sm:text-base truncate">BJ Promociones</span>
            <div className="ml-auto flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-slate-500 min-w-0">
              <span className="hidden md:inline truncate">
                {session?.user.email} · {perfil?.rol ?? 'sin rol'}
              </span>
              <button
                onClick={() => void signOut()}
                className="text-slate-600 hover:text-slate-900 font-medium shrink-0"
              >
                Salir
              </button>
            </div>
          </div>

          <nav className="flex items-center gap-1 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
            {link('/caja', 'Caja')}
            {isSup && link('/admin', 'Panel')}
            {isSup && link('/admin/campanas', 'Campañas')}
            {isSup && link('/admin/whatsapp', 'WhatsApp')}
            {isSup && link('/admin/usuarios', 'Usuarios')}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-3 sm:p-4">
        <Outlet />
      </main>
    </div>
  )
}
