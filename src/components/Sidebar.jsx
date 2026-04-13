import React from 'react'
import {
  LayoutDashboard, Users, CreditCard, Gift, Settings, LogOut, BookOpen,
} from 'lucide-react'

const NAV_ITEMS = [
  { id: 'dashboard',      label: 'Dashboard',       Icon: LayoutDashboard },
  { id: 'users',          label: 'Users',            Icon: Users },
  { id: 'subscriptions',  label: 'Subscriptions',    Icon: CreditCard },
  { id: 'promos',         label: 'Promo / Comps',    Icon: Gift },
  { id: 'philoinvestor',  label: 'Philoinvestor',    Icon: BookOpen },
  { id: 'settings',       label: 'Settings',         Icon: Settings },
]

export default function Sidebar({ activeTab, onTabChange, onSignOut, adminEmail }) {
  return (
    <div className="w-56 bg-white border-r border-gray-200 flex flex-col h-screen fixed left-0 top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-none">CT3000</p>
            <p className="text-xs text-blue-600 font-medium mt-0.5">Admin</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              activeTab === id
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 truncate mb-2">{adminEmail}</p>
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  )
}
