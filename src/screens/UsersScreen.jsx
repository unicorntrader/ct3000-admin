import React, { useState, useEffect, useMemo } from 'react'
import { apiFetch } from '../lib/api'
import { fmtDate } from '../lib/format'
import { INVITE_BASE_URL } from '../lib/constants'
import StatusBadge from '../components/StatusBadge'
import Spinner from '../components/Spinner'
import LoadError from '../components/LoadError'
import { Search, RefreshCw, ExternalLink, Copy } from 'lucide-react'
import UserDetailPanel from './UserDetailPanel'

// 'none' covers users without any user_subscriptions row. SubscriptionsScreen
// drops it from its filter list because every row in user_subscriptions has a
// status by definition. Keep these intentionally divergent.
const STATUS_FILTERS = ['all', 'trialing', 'active', 'canceled', 'pending', 'none']

export default function UsersScreen() {
  const [users, setUsers] = useState([])
  const [subsMap, setSubsMap] = useState({})
  const [plansMap, setPlansMap] = useState({})
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedUser, setSelectedUser] = useState(null)
  const [copiedInviteId, setCopiedInviteId] = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [usersRes, invitesRes] = await Promise.all([
        apiFetch('/api/users'),
        apiFetch('/api/invites'),
      ])

      const map = {}
      for (const s of (usersRes.subscriptions || [])) map[s.user_id] = s
      setSubsMap(map)
      setPlansMap(usersRes.planCounts || {})
      setUsers(usersRes.users || [])
      setInvites(invitesRes.invites || [])
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return users.filter(u => {
      const sub = subsMap[u.id]
      const status = sub?.subscription_status || 'none'
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (search && !u.email?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [users, subsMap, search, statusFilter])

  const handleUserUpdated = () => {
    fetchData()
    setSelectedUser(null)
  }

  if (loading) return <Spinner />
  if (error) return <LoadError message={`Error: ${error}`} onRetry={fetchData} />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Users <span className="text-gray-400 font-normal text-base ml-1">({filtered.length})</span></h1>
        <button onClick={fetchData} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
          />
        </div>
        <div className="flex items-center gap-1.5">
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
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {['Email', 'Joined', 'Status', 'Trial ends', 'Period ends', 'Stripe ID', 'Plans', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">No users found</td>
              </tr>
            ) : filtered.map(u => {
              const sub = subsMap[u.id]
              return (
                <tr
                  key={u.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedUser({ user: u, sub })}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-3"><StatusBadge status={sub?.subscription_status} /></td>
                  <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(sub?.trial_ends_at)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(sub?.current_period_ends_at)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                    {sub?.stripe_customer_id ? (
                      <span className="flex items-center gap-1">
                        {sub.stripe_customer_id.slice(-8)}
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{plansMap[u.id] || 0}</td>
                  <td className="px-4 py-3 text-xs text-blue-600 font-medium">View →</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Pending Invites
            <span className="text-gray-400 font-normal ml-1.5">({invites.length})</span>
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Email', 'Invited', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invites.map(inv => {
                  const url = INVITE_BASE_URL + inv.token
                  return (
                    <tr key={inv.id}>
                      <td className="px-4 py-3 text-sm text-gray-900">{inv.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(inv.invited_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(url)
                            setCopiedInviteId(inv.id)
                            setTimeout(() => setCopiedInviteId(null), 2000)
                          }}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {copiedInviteId === inv.id ? 'Copied!' : 'Copy link'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User detail panel */}
      {selectedUser && (
        <UserDetailPanel
          user={selectedUser.user}
          sub={selectedUser.sub}
          onClose={() => setSelectedUser(null)}
          onUpdated={handleUserUpdated}
        />
      )}
    </div>
  )
}
