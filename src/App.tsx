import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from '@/components/viewer/ErrorBoundary'
import { AuthGate } from '@/components/ui/AuthGate'
import { useAuthContext } from '@/hooks/useAuthContext'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { TestLauncher } from '@/pages/TestLauncher'
import { ScoutViewerPage } from '@/pages/ScoutViewerPage'
import { SessionJoinPage } from '@/pages/SessionJoinPage'
import { AdminLayout } from '@/pages/admin/AdminLayout'
import { PropertyList } from '@/pages/admin/PropertyList'
import { PropertyDetail } from '@/pages/admin/PropertyDetail'
import { AnalyticsPlaceholder } from '@/pages/admin/AnalyticsPlaceholder'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthGate>
          <AppRoutes />
        </AuthGate>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

function AppRoutes() {
  const { user } = useAuthContext()
  const loadSubscription = useSubscriptionStore((s) => s.loadSubscription)

  // Load subscription on auth
  useEffect(() => {
    if (user) {
      loadSubscription(user.uid)
    }
  }, [user, loadSubscription])

  // Restore high contrast mode from localStorage
  useEffect(() => {
    try {
      if (localStorage.getItem('vr-scout:high-contrast') === 'true') {
        document.documentElement.classList.add('high-contrast')
      }
    } catch {}
  }, [])

  return (
    <Routes>
      <Route path="/" element={<TestLauncher />} />
      <Route path="/scout/:locationId" element={<ScoutViewerPage />} />
      <Route path="/session/:sessionId" element={<SessionJoinPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="properties" replace />} />
        <Route path="properties" element={<PropertyList />} />
        <Route path="properties/new" element={<PropertyDetail />} />
        <Route path="properties/:id" element={<PropertyDetail />} />
        <Route path="analytics" element={<AnalyticsPlaceholder />} />
      </Route>
    </Routes>
  )
}
