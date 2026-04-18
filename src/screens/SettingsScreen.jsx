import React, { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { RefreshCw } from 'lucide-react'

function Row({ label, hint, children }) {
  return (
    <div className="px-5 py-4 flex items-center justify-between gap-4 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export default function SettingsScreen() {
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { fetchSettings() }, [])

  const fetchSettings = async () => {
    setLoading(true)
    setError(null)
    try {
      const { settings } = await apiFetch('/api/settings')
      const mm = settings?.find(r => r.key === 'maintenance_mode')
      setMaintenanceMode(mm?.value === 'true')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const toggleMaintenance = async () => {
    setSaving(true)
    setError(null)
    const newVal = !maintenanceMode
    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        body: { key: 'maintenance_mode', value: String(newVal) },
      })
      setMaintenanceMode(newVal)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <button onClick={fetchSettings} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 mb-4">{error}</div>
      )}

      {/* Stripe */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Stripe</p>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <Row label="Price ID" hint="Stripe price in use for subscriptions">
            <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">
              {process.env.REACT_APP_STRIPE_PRICE_ID || <span className="text-gray-400">REACT_APP_STRIPE_PRICE_ID not set</span>}
            </span>
          </Row>
          <Row label="Webhook endpoint" hint="Vercel serverless function">
            <span className="text-xs font-mono text-gray-500">
              {process.env.REACT_APP_SUPABASE_URL ? 'https://ct3000-react.vercel.app/api/stripe-webhook' : '—'}
            </span>
          </Row>
          <Row label="Trial period" hint="Days granted on new signup">
            <span className="text-sm font-semibold text-gray-900 bg-gray-100 px-3 py-1 rounded-lg">7 days</span>
          </Row>
        </div>
      </div>

      {/* App */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">App</p>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <Row
            label="Maintenance mode"
            hint={maintenanceMode ? 'App is showing maintenance screen to users' : 'App is live and accessible'}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
            ) : (
              <button
                onClick={toggleMaintenance}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                  maintenanceMode ? 'bg-red-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    maintenanceMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            )}
          </Row>
        </div>
        {maintenanceMode && (
          <div className="mt-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
            Maintenance mode is <strong>ON</strong> — CT3000 users are seeing a maintenance screen.
          </div>
        )}
      </div>
    </div>
  )
}
