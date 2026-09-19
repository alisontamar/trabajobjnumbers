import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { Rol } from '@crm/shared'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode
  roles?: Rol[]
}) {
  const { session, perfil, loading } = useAuth()

  if (loading) return <div className="p-8 text-slate-500">Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  if (roles && (!perfil || !roles.includes(perfil.rol))) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
