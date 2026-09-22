import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Caja from './pages/Caja'
import Dashboard from './pages/admin/Dashboard'
import Campanas from './pages/admin/Campanas'
import CampanaNueva from './pages/admin/CampanaNueva'
import WhatsAppPage from './pages/admin/WhatsApp'
import Usuarios from './pages/admin/Usuarios'

export default function App() {
  const { perfil } = useAuth()
  const inicio = perfil?.rol === 'cajero' ? '/caja' : '/admin'

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to={inicio} replace />} />
        <Route path="caja" element={<Caja />} />
        <Route
          path="admin"
          element={
            <ProtectedRoute roles={['supervisor', 'admin']}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/campanas"
          element={
            <ProtectedRoute roles={['supervisor', 'admin']}>
              <Campanas />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/campanas/nueva"
          element={
            <ProtectedRoute roles={['supervisor', 'admin']}>
              <CampanaNueva />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/whatsapp"
          element={
            <ProtectedRoute roles={['supervisor', 'admin']}>
              <WhatsAppPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/usuarios"
          element={
            <ProtectedRoute roles={['supervisor', 'admin']}>
              <Usuarios />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
