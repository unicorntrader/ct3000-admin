import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { RefreshCw, Gift, CheckCircle, UserX } from 'lucide-react'

const FOREVER_DATE = '2099-01-01T00:00:00.000Z'

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const isForeverComped = (sub) =>
  sub?.current_period_ends_at?.startsWith('2099') || sub?.trial_ends_at?.startsWith('2099')

export default function PhiloinvestorScreen() {
  const [members, setMembers] = useState([])
  const [supabaseUserMap, setSupabaseUserMap] = useState({}) // email.lower -> user
  const [subsMap, setSubsMap] = useState({})               // user_id -> sub
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [grantingId, setGrantingId] = useState(null)
  const [grantedIds, setGrantedIds] = useState(new Set())
  const [grantErrors, setGrantErrors] = useState({})

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ghost-members')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Ghost proxy error: ${res.status}`)
      }
      const { members: ghostMembers } = await res.json()

      const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      if (usersErr) throw usersErr
      const emailMap = {}
      for (const u of (users || [])) if (u.email) emailMap[u.email.toLowerCase()] = u

      const { data: subs } = await supabase.from('user_subscriptions').select('*')
      const sMap = {}
      for (const s of (subs || [])) sMap[s.user_id] = s

      setMembers(ghostMembers || [])
      setSupabaseUserMap(emailMap)
      setSubsMap(sMap)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const handleGrant = async (member) => {
    const supaUser = supabaseUserMap[member.email?.toLowerCase()]
    if (!supaUser) return

    setGrantingId(member.id)
    setGrantErrors(prev => { const n = { ...prev }; delete n[member.id]; return n })

    try {
      const existingSub = subsMap[supaUser.id]
      const payload = {
        subscription_status: 'active',
        trial_ends_at: FOREVER_DATE,
        current_period_ends_at: FOREVER_DATE,
        is_comped: true,
      }

      const { error: subErr } = existingSub
        ? await supabase.from('user_subscriptions').update(payload).eq('user_id', supaUser.id)
        : await supabase.from('user_subscriptions').insert({ user_id: supaUser.id, ...payload })

      if (subErr) throw subErr

      const { data: { session } } = await supabase.auth.getSession()
      await supabase.from('admin_actions').insert({
        admin_user_id: session?.user?.id,
        target_user_id: supaUser.id,
        action_type: 'comp_access',
        notes: `Philoinvestor Ghost member: ${member.email}`,
        expires_at: FOREVER_DATE,
      })

      setGrantedIds(prev => new Set([...prev, member.id]))
      setSubsMap(prev => ({ ...prev, [supaUser.id]: { ...prev[supaUser.id], ...payload, user_id: supaUser.id } }))
    } catch (err) {
      setGrantErrors(prev => ({ ...prev, [member.id]: err.message }))
    }
    setGrantingId(null)
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
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Philoinvestor
            <span className="text-gray-400 font-normal text-base ml-2">({members.length} paid members)</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Ghost paid members — grant CT3000 access</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {['Email', 'Name', 'Subscribed', 'Ghost status', 'CT3000 status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {members.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No paid members found</td>
              </tr>
            ) : members.map(m => {
              const supaUser = supabaseUserMap[m.email?.toLowerCase()]
              const sub = supaUser ? subsMap[supaUser.id] : null
              const alreadyComped = isForeverComped(sub)
              const granted = grantedIds.has(m.id) || alreadyComped
              const isGranting = grantingId === m.id
              const grantError = grantErrors[m.id]

              return (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{m.name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(m.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-green-50 text-green-700">
                      {m.status || 'paid'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {supaUser ? (
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        granted
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {granted ? 'Comped forever' : (sub?.subscription_status || 'no sub')}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-gray-100 text-gray-400">
                        Not signed up
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {grantError && <p className="text-xs text-red-500 mb-1">{grantError}</p>}
                    {supaUser && !granted && (
                      <button
                        onClick={() => handleGrant(m)}
                        disabled={isGranting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 text-xs text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50"
                      >
                        <Gift className="w-3.5 h-3.5" />
                        {isGranting ? 'Granting…' : 'Grant CT3000 access'}
                      </button>
                    )}
                    {supaUser && granted && (
                      <span className="flex items-center gap-1.5 text-xs text-green-600">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Access granted
                      </span>
                    )}
                    {!supaUser && (
                      <span className="flex items-center gap-1.5 text-xs text-gray-400">
                        <UserX className="w-3.5 h-3.5" />
                        Not signed up yet
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
