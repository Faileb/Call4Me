import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Recordings } from './pages/Recordings'
import { Contacts } from './pages/Contacts'
import { Templates } from './pages/Templates'
import { Schedule } from './pages/Schedule'
import { Queue } from './pages/Queue'
import { History } from './pages/History'
import { Settings } from './pages/Settings'
import { SetupWizard } from './pages/Setup/SetupWizard'
import { api } from './lib/api'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data: session, isLoading } = useQuery({
    queryKey: ['session'],
    queryFn: api.auth.session,
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  // If auth is not enabled (passwordless mode), allow access
  if (!session?.authEnabled) {
    return <>{children}</>
  }

  if (!session?.authenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default function App() {
  const queryClient = useQueryClient()

  const { data: session, isLoading } = useQuery({
    queryKey: ['session'],
    queryFn: api.auth.session,
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Show setup wizard if in setup mode
  if (session?.isSetupMode) {
    return (
      <SetupWizard
        onComplete={() => {
          queryClient.invalidateQueries()
          window.location.reload()
        }}
      />
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/recordings" element={<Recordings />} />
                  <Route path="/contacts" element={<Contacts />} />
                  <Route path="/templates" element={<Templates />} />
                  <Route path="/schedule" element={<Schedule />} />
                  <Route path="/queue" element={<Queue />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
