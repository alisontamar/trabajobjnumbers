import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Layout() {
  const { perfil, session, signOut } = useAuth()
  const loc = useLocation()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const isAdmin = perfil?.rol === 'admin'
  const isSup = perfil?.rol === 'supervisor' || isAdmin

  const items: { to: string; label: string }[] = [
    { to: '/caja', label: 'Caja' },
    ...(isSup ? [{ to: '/admin', label: 'Panel' }] : []),
    ...(isSup ? [{ to: '/admin/campanas', label: 'Campañas' }] : []),
    ...(isSup ? [{ to: '/admin/whatsapp', label: 'WhatsApp' }] : []),
    ...(isSup ? [{ to: '/admin/usuarios', label: 'Usuarios' }] : []),
  ]

  const linkClass = (to: string, block = false) =>
    `${block ? 'block' : ''} px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition ${
      loc.pathname === to ? 'bg-brand-800 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-2">
          <img src="/logo-bj.png" alt="BJ Promociones" className="h-8 w-auto shrink-0" />
          <span className="font-semibold text-sm sm:text-base truncate">BJ Promociones</span>

          <nav className="hidden md:flex items-center gap-1 ml-4">
            {items.map((i) => (
              <Link key={i.to} to={i.to} className={linkClass(i.to)}>
                {i.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
            <span className="hidden lg:inline truncate">
              {session?.user.email} · {perfil?.rol ?? 'sin rol'}
            </span>
            <button
              onClick={() => void signOut()}
              className="hidden md:inline text-slate-600 hover:text-slate-900 font-medium"
            >
              Salir
            </button>
            <button
              onClick={() => setMenuAbierto((v) => !v)}
              aria-label={menuAbierto ? 'Cerrar menu' : 'Abrir menu'}
              className="md:hidden p-2 -mr-2 text-slate-700 shrink-0"
            >
              {menuAbierto ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {menuAbierto && (
          <nav className="md:hidden border-t bg-white px-3 py-2 space-y-1">
            {items.map((i) => (
              <Link
                key={i.to}
                to={i.to}
                onClick={() => setMenuAbierto(false)}
                className={linkClass(i.to, true)}
              >
                {i.label}
              </Link>
            ))}
            <div className="border-t mt-2 pt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 truncate">
                {session?.user.email} · {perfil?.rol ?? 'sin rol'}
              </span>
              <button
                onClick={() => {
                  setMenuAbierto(false)
                  void signOut()
                }}
                className="text-sm text-red-600 font-medium shrink-0"
              >
                Salir
              </button>
            </div>
          </nav>
        )}
      </header>
      <main className="max-w-5xl mx-auto p-3 sm:p-4">
        <Outlet />
      </main>
    </div>
  )
}
