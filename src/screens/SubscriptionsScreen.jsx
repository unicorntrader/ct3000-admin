import React, { useState, useEffect, useMemo } from 'react'
import { apiFetch } from '../lib/api'
import { fmtDate } from '../lib/format'
import { MRR_PER_USER } from '../lib/constants'
import StatusBadge from '../components/StatusBadge'
import Spinner from '../components/Spinner'
import LoadError from '../components/LoadError'
import { RefreshCw, ExternalLink } from 'lucide-react'

// Drops 'none' compared to UsersScreen because every row in user_subscriptions
// has a status by definition. Keep these intentionally divergent.
const STATUS_FILTERS = ['all', 'active', 'trialing', 'canceled', 'pending']

export default function SubscriptionsScreen() {
  const [subs, setSubs] = useState([])
  const [emailMap, setEmailMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { users, subscriptions } = await apiFetch('/api/users')

      const map = {}
      for (const u of (users || [])) map[u.id] = u.email
      setEmailMap(map)

      // Match prior client-side ordering (newest first by created_at)
      const sorted = [...(subscriptions || [])].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      )
      setSubs(sorted)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return subs
    return subs.filter(s => s.subscription_status === statusFilter)
  }, [subs, statusFilter])

  const active = subs.filter(s => s.subscription_status === 'active').length
  const trialing = subs.filter(s => s.subscription_status === 'trialing').length
  const canceled = subs.filter(s => s.subscription_status === 'canceled').length
  const mrr = active * MRR_PER_USER

  if (loading) return <Spinner />
  if (error) return <LoadError message={`Error: ${error}`} onRetry={fetchData} />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Subscriptions</h1>
        <button onClick={fetchData} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* MRR summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'MRR', value: `$${mrr.toLocaleString()}`, color: 'text-blue-600' },
          { label: 'Active', value: active, color: 'text-green-600' },
          { label: 'Trialing', value: trialing, color: 'text-amber-600' },
          { label: 'Canceled', value: canceled, color: 'text-red-500' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-xs text-gray-400 mb-1">{c.label}</p>
            <p className={`text-2xl font-semibold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1.5 mb-4">
        {STATUS_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === f
                ? 'bg-blue-600 text-white border-transparent'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {['Email', 'Status', 'Stripe customer', 'Stripe subscription', 'Trial ends', 'Period ends', 'Created'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">No results</td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{emailMap[s.user_id] || s.user_id}</td>
                <td className="px-4 py-3"><StatusBadge status={s.subscription_status} /></td>
                <td className="px-4 py-3">
                  {s.stripe_customer_id ? (
                    <a
                      href={`https://dashboard.stripe.com/customers/${s.stripe_customer_id}`}
                      target="_blank" rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-blue-600 font-mono hover:underline"
                    >
                      {s.stripe_customer_id} <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 font-mono">{s.stripe_subscription_id || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(s.trial_ends_at)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(s.current_period_ends_at)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(s.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
