import React, { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { RefreshCw, Gift, CheckCircle, Copy } from 'lucide-react'

const INVITE_BASE = 'https://ct3000-react.vercel.app/signup?invite='

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PhiloinvestorScreen() {
  const [members, setMembers] = useState([])
  const [supabaseUserMap, setSupabaseUserMap] = useState({})
  const [subsMap, setSubsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [grantingId, setGrantingId] = useState(null)
  const [grantedIds, setGrantedIds] = useState(new Set())
  const [inviteLinks, setInviteLinks] = useState({}) // ghost member id -> invite url
  const [copiedId, setCopiedId] = useState(null)
  const [grantErrors, setGrantErrors] = useState({})

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Ghost members come straight from the existing serverless route.
      const ghostRes = await fetch('/api/ghost-members')
      if (!ghostRes.ok) {
        const body = await ghostRes.json().catch(() => ({}))
        throw new Error(body.error || `Ghost proxy error: ${ghostRes.status}`)
      }
      const { members: ghostMembers } = await ghostRes.json()

      const [{ users, subscriptions }, { invites }] = await Promise.all([
        apiFetch('/api/users'),
        apiFetch('/api/invites'),
      ])

      const emailMap = {}
      for (const u of (users || [])) if (u.email) emailMap[u.email.toLowerCase()] = u

      const sMap = {}
      for (const s of (subscriptions || [])) sMap[s.user_id] = s

      const inviteMap = {}
      for (const inv of (invites || [])) inviteMap[inv.email.toLowerCase()] = INVITE_BASE + inv.token

      setMembers(ghostMembers || [])
      setSupabaseUserMap(emailMap)
      setSubsMap(sMap)

      const idInviteMap = {}
      for (const m of (ghostMembers || [])) {
        const link = inviteMap[m.email?.toLowerCase()]
        if (link) idInviteMap[m.id] = link
      }
      setInviteLinks(idInviteMap)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const handleGrant = async (member) => {
    setGrantingId(member.id)
    setGrantErrors(prev => { const n = { ...prev }; delete n[member.id]; return n })

    try {
      const periodEnd = member.subscriptions?.[0]?.current_period_end || null
      const res = await apiFetch('/api/philoinvestor/grant', {
        method: 'POST',
        body: { email: member.email, ghostMemberId: member.id, periodEnd },
      })

      if (res.status === 'granted') {
        setGrantedIds(prev => new Set([...prev, member.id]))
        // Refresh from /api so subsMap reflects the new active sub
        fetchData()
      } else if (res.status === 'invited') {
        setInviteLinks(prev => ({ ...prev, [member.id]: res.inviteUrl }))
      }
    } catch (err) {
      setGrantErrors(prev => ({ ...prev, [member.id]: err.message }))
    }
    setGrantingId(null)
  }

  const copyLink = (id, url) => {
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
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

  const filtered = members.filter(m => statusFilter === 'all' || m.status === statusFilter)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Philoinvestor
            <span className="text-gray-400 font-normal text-base ml-2">({members.length} members)</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Ghost paid members — CT3000 access mirrors Ghost subscription</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-1.5 mb-4">
        {['all', 'paid', 'comped'].map(f => (
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

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {['Email', 'Name', 'Subscribed', 'Status', 'CT3000 status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No members found</td>
              </tr>
            ) : filtered.map(m => {
              const supaUser = supabaseUserMap[m.email?.toLowerCase()]
              const sub = supaUser ? subsMap[supaUser.id] : null
              const isActive = sub?.subscription_status === 'active'
              const granted = grantedIds.has(m.id) || isActive
              const inviteUrl = inviteLinks[m.id]
              const isGranting = grantingId === m.id
              const grantError = grantErrors[m.id]

              return (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{m.name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(m.created_at)}</td>
                  <td className="px-4 py-3">
                    {m.status === 'comped'
                      ? <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-purple-50 text-purple-700">Comped</span>
                      : <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-green-50 text-green-700">Paid</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {granted ? (
                      <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-green-50 text-green-700">active</span>
                    ) : inviteUrl ? (
                      <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-amber-50 text-amber-700">invite sent</span>
                    ) : supaUser ? (
                      <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-gray-100 text-gray-500">
                        {sub?.subscription_status || 'no sub'}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-gray-100 text-gray-400">not signed up</span>
                    )}
                  </td>
                  <td className="px-4 py-3 min-w-[200px]">
                    {grantError && <p className="text-xs text-red-500 mb-1">{grantError}</p>}
                    {granted ? (
                      <span className="flex items-center gap-1.5 text-xs text-green-600">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Access active
                      </span>
                    ) : inviteUrl ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-amber-600 font-medium">Invite sent ✓</span>
                        <button
                          onClick={() => copyLink(m.id, inviteUrl)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                          <Copy className="w-3 h-3" />
                          {copiedId === m.id ? 'Copied!' : 'Copy link'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGrant(m)}
                        disabled={isGranting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 text-xs text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50"
                      >
                        <Gift className="w-3.5 h-3.5" />
                        {isGranting ? 'Sending…' : 'Grant CT3000 access'}
                      </button>
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
