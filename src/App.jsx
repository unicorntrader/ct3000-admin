import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabaseClient'
import AdminAuthGate, { isAdminEmail } from './components/AdminAuthGate'
import Sidebar from './components/Sidebar'
import DashboardScreen from './screens/DashboardScreen'
import UsersScreen from './screens/UsersScreen'
import SubscriptionsScreen from './screens/SubscriptionsScreen'
import PromoCodesScreen from './screens/PromoCodesScreen'
import SettingsScreen from './screens/SettingsScreen'

function AppShell({ session }) {
  const [activeTab, setActiveTab] = useState('dashboard')

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard':     return <DashboardScreen />
      case 'users':         return <UsersScreen />
      case 'subscriptions': return <SubscriptionsScreen />
      case 'promos':        return <PromoCodesScreen />
      case 'settings':      return <SettingsScreen />
      default:              return <DashboardScreen />
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSignOut={handleSignOut}
        adminEmail={session.user.email}
      />
      <main className="ml-56 flex-1 px-8 py-8">
        {renderScreen()}
      </main>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <AdminAuthGate session={session} onSession={setSession}>
      <AppShell session={session} />
    </AdminAuthGate>
  )
}
