import { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { supabase } from './lib/supabaseClient';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';
import CalendarEditor from './components/CalendarEditor';
import ProfilePage from './components/ProfilePage';
import ResetPasswordForm from './components/ResetPasswordForm';

type View =
  | { screen: 'dashboard' }
  | { screen: 'calendar'; id: string }
  | { screen: 'profile' };

function App() {
  const { session, loading } = useAuth();
  const [view, setView] = useState<View>({ screen: 'dashboard' });
  const [isRecovery, setIsRecovery] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return <p style={{ padding: '2rem' }}>Chargement...</p>;

  if (isRecovery) return <ResetPasswordForm />;

  if (!session) return <AuthPage />;

  if (view.screen === 'calendar') {
    return (
      <CalendarEditor
        key={view.id}
        calendarId={view.id}
        onBack={() => setView({ screen: 'dashboard' })}
      />
    );
  }

  if (view.screen === 'profile') {
    return (
      <ProfilePage
        key={refreshKey}
        user={session.user}
        onBack={() => setView({ screen: 'dashboard' })}
        onUpdated={() => setRefreshKey((k) => k + 1)}
      />
    );
  }

  return (
    <Dashboard
      key={refreshKey}
      user={session.user}
      onOpenCalendar={(id) => setView({ screen: 'calendar', id })}
      onOpenProfile={() => setView({ screen: 'profile' })}
    />
  );
}

export default App;
