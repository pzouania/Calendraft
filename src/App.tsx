import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabaseClient'
import AuthPage from './components/AuthPage'
import Dashboard from './components/Dashboard'
import CalendarEditor from './components/CalendarEditor'
import ProfilePage from './components/ProfilePage'
import ResetPasswordForm from './components/ResetPasswordForm'
import SharedCalendarPage from './components/SharedCalendarPage'
import PartialShareView from './components/PartialShareView'
import PrivacyPage from './components/PrivacyPage'
import TermsPage from './components/TermsPage'
import AppDownloadPage from './components/AppDownloadPage'
import TermsGate from './components/TermsGate'
import { useI18n } from './hooks/useI18n'
import { startLangSync } from './lib/langSync'

type View = { screen: 'dashboard' } | { screen: 'calendar'; id: string } | { screen: 'profile' } | { screen: 'partial'; id: string }

const SHARE_PATH = /^\/s\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i
const PARTIAL_PATH = /^\/j\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i

const DASHBOARD: View = { screen: 'dashboard' }

// Page ouverte dans l'application (éditeur d'un calendrier, profil, partage reçu) : elle est mémorisée dans l'onglet
// (sessionStorage) pour qu'une actualisation de la page ramène au même endroit au lieu du tableau de bord.
//  - Seul cet onglet s'en souvient : fermer l'onglet, ou ouvrir le site ailleurs, ramène au tableau de bord (utile sur un
//    ordinateur partagé : rien ne reste après la fermeture).
//  - La mémoire est liée au compte connecté : une autre personne qui se connecte dans le même onglet n'en hérite pas.
//  - Seul l'identifiant de la page est gardé, jamais son contenu ; l'accès au calendrier reste contrôlé par la base. Si le
//    calendrier n'existe plus ou n'est plus accessible, la page affiche son message habituel et « Retour » ramène au tableau
//    de bord.
const VIEW_KEY = 'calendraft.view'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID_RE = /^[0-9A-Za-z_-]{1,64}$/

interface SavedView {
  userId: string
  view: View
}

function readSavedView(): SavedView | null {
  try {
    const raw = window.sessionStorage.getItem(VIEW_KEY)
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return null
    const { userId, screen, id } = data as Record<string, unknown>
    if (typeof userId !== 'string' || userId === '') return null
    if (screen === 'profile') return { userId, view: { screen } }
    if (screen === 'calendar' && typeof id === 'string' && UUID_RE.test(id)) return { userId, view: { screen, id } }
    if (screen === 'partial' && typeof id === 'string' && ID_RE.test(id)) return { userId, view: { screen, id } }
    return null
  } catch {
    return null
  }
}

function writeSavedView(userId: string, view: View) {
  try {
    if (view.screen === 'dashboard') window.sessionStorage.removeItem(VIEW_KEY)
    else window.sessionStorage.setItem(VIEW_KEY, JSON.stringify({ userId, ...view }))
  } catch {
    // Stockage indisponible (navigation privée stricte, par exemple) : après une actualisation, on revient au tableau de bord.
  }
}

function clearSavedView() {
  try {
    window.sessionStorage.removeItem(VIEW_KEY)
  } catch {
    // Rien à effacer.
  }
}

function App() {
  const { session, loading } = useAuth()
  const { t } = useI18n()
  // null = aucune navigation depuis le chargement de la page : on reprend alors la page mémorisée (voir plus bas).
  const [view, setView] = useState<View | null>(null)
  const [saved, setSaved] = useState<SavedView | null>(readSavedView)
  const [isRecovery, setIsRecovery] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true)
      }
      // Déconnexion : la page mémorisée est oubliée, la prochaine connexion démarre sur le tableau de bord.
      if (event === 'SIGNED_OUT') {
        clearSavedView()
        setSaved(null)
        setView(null)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Langue liée au compte (voir lib/langSync.ts).
  const syncUser = session?.user ?? null
  useEffect(() => (syncUser ? startLangSync(syncUser) : undefined), [syncUser?.id])

  const path = window.location.pathname.replace(/\/$/, '')
  if (path === '/confidentialite') return <PrivacyPage />
  if (path === '/conditions') return <TermsPage />
  if (path === '/application') return <AppDownloadPage />

  const shareMatch = window.location.pathname.match(SHARE_PATH)
  if (shareMatch) return <SharedCalendarPage token={shareMatch[1]} />

  const partialMatch = window.location.pathname.match(PARTIAL_PATH)
  if (partialMatch) return <PartialShareView token={partialMatch[1]} />

  if (loading) return <p style={{ padding: '2rem' }}>{t('common.loading')}</p>

  if (isRecovery) return <ResetPasswordForm />

  if (!session) return <AuthPage />

  // Page affichée : celle choisie depuis le chargement, sinon la page mémorisée par ce même compte, sinon le tableau de bord.
  const restored = saved && saved.userId === session.user.id ? saved.view : null
  const active: View = view ?? restored ?? DASHBOARD

  const go = (next: View) => {
    setView(next)
    writeSavedView(session.user.id, next)
  }

  let current: ReactNode
  if (active.screen === 'calendar') {
    current = (
      <CalendarEditor
        key={active.id}
        calendarId={active.id}
        onBack={() => go(DASHBOARD)}
      />
    )
  } else if (active.screen === 'partial') {
    current = <PartialShareView key={active.id} id={active.id} onBack={() => go(DASHBOARD)} />
  } else if (active.screen === 'profile') {
    current = (
      <ProfilePage
        key={refreshKey}
        user={session.user}
        onBack={() => go(DASHBOARD)}
        onUpdated={() => setRefreshKey((k) => k + 1)}
      />
    )
  } else {
    current = (
      <Dashboard
        key={refreshKey}
        user={session.user}
        onOpenCalendar={(id) => go({ screen: 'calendar', id })}
        onOpenProfile={() => go({ screen: 'profile' })}
        onOpenPartialShare={(id) => go({ screen: 'partial', id })}
      />
    )
  }

  // Tant que les conditions d'utilisation ne sont pas acceptées, un écran d'acceptation remplace l'application.
  return <TermsGate userId={session.user.id}>{current}</TermsGate>
}

export default App
