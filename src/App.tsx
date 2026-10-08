import { useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabaseClient'
import AuthPage from './components/AuthPage'
import Dashboard from './components/Dashboard'
import CalendarEditor from './components/CalendarEditor'
import ProfilePage from './components/ProfilePage'
import ResetPasswordForm from './components/ResetPasswordForm'
import SharedCalendarPage from './components/SharedCalendarPage'
import PrivacyPage from './components/PrivacyPage'
import TermsPage from './components/TermsPage'

type View = { screen: 'dashboard' } | { screen: 'calendar'; id: string } | { screen: 'profile' }

const SHARE_PATH = /^\/s\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i

function App() {
  const { session, loading } = useAuth()
  const [view, setView] = useState<View>({ screen: 'dashboard' })
  const [isRecovery, setIsRecovery] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const path = window.location.pathname.replace(/\/$/, '')
  if (path === '/confidentialite') return <PrivacyPage />
  if (path === '/conditions') return <TermsPage />

  const shareMatch = window.location.pathname.match(SHARE_PATH)
  if (shareMatch) return <SharedCalendarPage token={shareMatch[1]} />

  if (loading) return <p style={{ padding: '2rem' }}>Chargement...</p>

  if (isRecovery) return <ResetPasswordForm />

  if (!session) return <AuthPage />

  if (view.screen === 'calendar') {
    return (
      <CalendarEditor
        key={view.id}
        calendarId={view.id}
        onBack={() => setView({ screen: 'dashboard' })}
      />
    )
  }

  if (view.screen === 'profile') {
    return (
      <ProfilePage
        key={refreshKey}
        user={session.user}
        onBack={() => setView({ screen: 'dashboard' })}
        onUpdated={() => setRefreshKey((k) => k + 1)}
      />
    )
  }

  return (
    <Dashboard
      key={refreshKey}
      user={session.user}
      onOpenCalendar={(id) => setView({ screen: 'calendar', id })}
      onOpenProfile={() => setView({ screen: 'profile' })}
    />
  )
}

export default App
