import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Users, TrendingUp, XCircle, Clock, DollarSign, RefreshCw } from 'lucide-react'

const MRR_PER_USER = 30

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtTime = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StatCard({ label, value, sub, Icon, color = 'text-gray-900', iconBg = 'bg-gray-100', iconColor = 'text-gray-500' }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
        <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>
      <p className={`text-3xl font-bold ${color} mb-1`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

export default function DashboardScreen() {
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // All users from auth
      const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      if (usersErr) throw usersErr

      // All subscriptions
      const { data: subs, error: subsErr } = await supabase.from('user_subscriptions').select('*')
      if (subsErr) throw subsErr

      const now = new Date()
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)

      const totalUsers = users.length
      const newLast7 = users.filter(u => new Date(u.created_at) >= sevenDaysAgo).length
      const newLast30 = users.filter(u => new Date(u.created_at) >= thirtyDaysAgo).length

      const active = subs.filter(s => s.subscription_status === 'active').length
      const trialing = subs.filter(s => s.subscription_status === 'trialing').length
      const canceled = subs.filter(s => s.subscription_status === 'canceled').length
      const mrr = active * MRR_PER_USER

      // Trial conversion: (active / (active + canceled)) * 100 — excludes still-trialing
      const converted = active + canceled
      const conversionRate = converted > 0 ? Math.round((active / converted) * 100) : null

      setStats({ totalUsers, newLast7, newLast30, active, trialing, canceled, mrr, conversionRate })

      // Activity feed: recent signups + recent subscription changes
      const recentUsers = [...users]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5)
        .map(u => ({ type: 'signup', email: u.email, time: u.created_at }))

      const recentSubs = [...subs]
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, 5)
        .map(s => {
          const user = users.find(u => u.id === s.user_id)
          return { type: 'subscription', email: user?.email || s.user_id, status: s.subscription_status, time: s.updated_at }
        })

      const combined = [...recentUsers, ...recentSubs]
        .sort((a, b) => new Date(b.time) - new Date(a.time))
        .slice(0, 10)

      setActivity(combined)
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
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
        Failed to load dashboard: {error}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <button onClick={fetchData} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total users" value={stats.totalUsers} sub={`+${stats.newLast7} this week`} Icon={Users} iconBg="bg-blue-50" iconColor="text-blue-600" />
        <StatCard label="Active subscribers" value={stats.active} sub={`MRR $${(stats.mrr).toLocaleString()}`} Icon={TrendingUp} color="text-green-600" iconBg="bg-green-50" iconColor="text-green-600" />
        <StatCard label="Trialing" value={stats.trialing} sub="In free trial" Icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-500" />
        <StatCard label="Churned" value={stats.canceled} sub={stats.conversionRate != null ? `${stats.conversionRate}% trial conversion` : '—'} Icon={XCircle} color="text-red-500" iconBg="bg-red-50" iconColor="text-red-400" />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label="MRR" value={`$${stats.mrr.toLocaleString()}`} sub={`${stats.active} active × $${MRR_PER_USER}`} Icon={DollarSign} color="text-blue-600" iconBg="bg-blue-50" iconColor="text-blue-600" />
        <StatCard label="New (7d)" value={stats.newLast7} sub="Signups last 7 days" Icon={Users} iconBg="bg-gray-100" iconColor="text-gray-500" />
        <StatCard label="New (30d)" value={stats.newLast30} sub="Signups last 30 days" Icon={Users} iconBg="bg-gray-100" iconColor="text-gray-500" />
        <StatCard
          label="Trial conversion"
          value={stats.conversionRate != null ? `${stats.conversionRate}%` : '—'}
          sub="Trials → active (excl. ongoing)"
          Icon={TrendingUp}
          color={stats.conversionRate != null ? (stats.conversionRate >= 50 ? 'text-green-600' : 'text-amber-600') : 'text-gray-400'}
          iconBg="bg-gray-100"
          iconColor="text-gray-500"
        />
      </div>

      {/* Activity feed */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Recent activity</h2>
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No recent activity</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {activity.map((item, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    item.type === 'signup' ? 'bg-blue-400' :
                    item.status === 'active' ? 'bg-green-400' :
                    item.status === 'trialing' ? 'bg-amber-400' :
                    item.status === 'canceled' ? 'bg-red-400' : 'bg-gray-300'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{item.email}</p>
                    <p className="text-xs text-gray-400">
                      {item.type === 'signup' ? 'New signup' : `Subscription → ${item.status}`}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 whitespace-nowrap">{fmtTime(item.time)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
