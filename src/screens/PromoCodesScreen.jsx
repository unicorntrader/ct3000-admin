import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { RefreshCw, Plus, Search } from 'lucide-react'

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const ACTION_LABELS = {
  comp_access:          'Comp access',
  extend_trial:         'Extend trial',
  cancel_subscription:  'Cancel subscription',
}

function GrantCompModal({ onClose, onGranted }) {
  const [emailSearch, setEmailSearch] = useState('')
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [months, setMonths] = useState(12)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const searchUsers = async () => {
    if (!emailSearch.trim()) return
    const { data: { users: found } } = await supabase.auth.admin.listUsers({ perPage: 50 })
    setUsers((found || []).filter(u => u.email?.toLowerCase().includes(emailSearch.toLowerCase())))
  }

  const handleGrant = async () => {
    if (!selectedUser) return
    setSaving(true)
    setError(null)

    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + months)

    // Check if sub exists
    const { data: existingSub } = await supabase
      .from('user_subscriptions')
      .select('id')
      .eq('user_id', selectedUser.id)
      .maybeSingle()

    const payload = {
      user_id: selectedUser.id,
      subscription_status: 'active',
      current_period_ends_at: expiresAt.toISOString(),
    }

    const { error: subErr } = existingSub
      ? await supabase.from('user_subscriptions').update(payload).eq('user_id', selectedUser.id)
      : await supabase.from('user_subscriptions').insert(payload)

    if (subErr) { setError(subErr.message); setSaving(false); return }

    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('admin_actions').insert({
      admin_user_id: session?.user?.id,
      target_user_id: selectedUser.id,
      action_type: 'comp_access',
      notes: note || null,
      expires_at: expiresAt.toISOString(),
    })

    setSaving(false)
    onGranted()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">Grant complimentary access</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* User search */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Find user by email</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  value={emailSearch}
                  onChange={e => setEmailSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchUsers()}
                  placeholder="user@example.com"
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
                />
              </div>
              <button onClick={searchUsers} className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-700 hover:bg-gray-200">Search</button>
            </div>
            {users.length > 0 && (
              <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden">
                {users.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setSelectedUser(u); setUsers([]) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${selectedUser?.id === u.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                  >
                    {u.email}
                  </button>
                ))}
              </div>
            )}
            {selectedUser && (
              <p className="mt-1.5 text-xs text-blue-600 font-medium">Selected: {selectedUser.email}</p>
            )}
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Duration (months)</label>
            <input type="number" min={1} max={24} value={months} onChange={e => setMonths(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50" />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason / note</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Partnership, bug comp, press..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50" />
          </div>

          {error && <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleGrant}
              disabled={!selectedUser || saving}
              className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-40"
            >
              {saving ? 'Granting…' : `Grant ${months} months`}
            </button>
            <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-xl hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PromoCodesScreen() {
  const [actions, setActions] = useState([])
  const [emailMap, setEmailMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: actErr } = await supabase
        .from('admin_actions')
        .select('*')
        .order('created_at', { ascending: false })
      if (actErr) throw actErr

      const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      if (usersErr) throw usersErr

      const map = {}
      for (const u of (users || [])) map[u.id] = u.email
      setEmailMap(map)
      setActions(data || [])
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">Error: {error}</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Promo / Comps</h1>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Grant comp
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {['User', 'Action', 'Granted by', 'Expires', 'Note', 'Date'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {actions.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No admin actions yet</td></tr>
            ) : actions.map(a => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{emailMap[a.target_user_id] || a.target_user_id}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-blue-50 text-blue-700">
                    {ACTION_LABELS[a.action_type] || a.action_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{emailMap[a.admin_user_id] || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(a.expires_at)}</td>
                <td className="px-4 py-3 text-sm text-gray-500 italic">{a.notes || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-400">{fmtDate(a.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <GrantCompModal
          onClose={() => setShowModal(false)}
          onGranted={() => { setShowModal(false); fetchData() }}
        />
      )}
    </div>
  )
}
