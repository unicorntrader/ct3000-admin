import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { apiFetch } from '../lib/api'
import { X, ExternalLink, Gift, Clock, XCircle, Trash2, Database, Sparkles, Eraser } from 'lucide-react'

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const statusBadge = (status) => {
  const styles = {
    active:   'bg-green-50 text-green-700',
    trialing: 'bg-amber-50 text-amber-700',
    canceled: 'bg-red-50 text-red-600',
    pending:  'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${styles[status] || 'bg-gray-100 text-gray-400'}`}>
      {status || 'none'}
    </span>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-gray-50 last:border-0">
      <p className="text-xs text-gray-400 w-36 flex-shrink-0 pt-0.5">{label}</p>
      <p className="text-sm text-gray-800 text-right break-all font-mono">{value || '—'}</p>
    </div>
  )
}

export default function UserDetailPanel({ user, sub, onClose, onUpdated }) {
  const [action, setAction] = useState(null) // 'comp' | 'extend' | 'cancel' | 'delete'
  const [compMonths, setCompMonths] = useState(12)  // number or 'forever'
  const [compNote, setCompNote] = useState('')
  const [extendDays, setExtendDays] = useState(7)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Data section state
  const [counts, setCounts] = useState(null)
  const [countsLoading, setCountsLoading] = useState(true)
  const [dataSaving, setDataSaving] = useState(false)
  const [dataMessage, setDataMessage] = useState(null)
  const [confirmClearDemo, setConfirmClearDemo] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  const refreshCounts = useCallback(async () => {
    if (!user?.id) return
    setCountsLoading(true)
    try {
      const c = await apiFetch(`/api/users/${user.id}/data-counts`)
      setCounts(c)
    } catch (err) {
      setError(`Failed to load counts: ${err.message}`)
    }
    setCountsLoading(false)
  }, [user?.id])

  useEffect(() => { refreshCounts() }, [refreshCounts])

  const handleSeed = async () => {
    setDataSaving(true); setDataMessage(null); setError(null)
    try {
      await apiFetch(`/api/users/${user.id}/seed-demo`, { method: 'POST' })
      setDataMessage('Demo data seeded.')
      refreshCounts()
    } catch (err) {
      setError(`Seed failed: ${err.message}`)
    }
    setDataSaving(false)
  }

  const handleClearDemo = async () => {
    if (!confirmClearDemo) { setConfirmClearDemo(true); setConfirmClearAll(false); return }
    setDataSaving(true); setDataMessage(null); setError(null)
    try {
      await apiFetch(`/api/users/${user.id}/clear-demo`, { method: 'POST' })
      setDataMessage('Demo data cleared.')
      refreshCounts()
    } catch (err) {
      setError(`Clear demo failed: ${err.message}`)
    }
    setDataSaving(false); setConfirmClearDemo(false)
  }

  const handleClearAll = async () => {
    if (!confirmClearAll) { setConfirmClearAll(true); setConfirmClearDemo(false); return }
    setDataSaving(true); setDataMessage(null); setError(null)
    try {
      await apiFetch(`/api/users/${user.id}/clear-all`, { method: 'POST' })
      setDataMessage('All user data cleared.')
      refreshCounts()
    } catch (err) {
      setError(`Clear all failed: ${err.message}`)
    }
    setDataSaving(false); setConfirmClearAll(false)
  }


  const handleComp = async () => {
    setSaving(true)
    setError(null)
    const FOREVER = '2099-01-01T00:00:00.000Z'
    const isForever = compMonths === 'forever'
    const expiresAt = isForever ? new Date(FOREVER) : (() => { const d = new Date(); d.setMonth(d.getMonth() + compMonths); return d })()

    // Update subscription
    const basePayload = {
      subscription_status: 'active',
      current_period_ends_at: expiresAt.toISOString(),
      ...(isForever ? { trial_ends_at: FOREVER, is_comped: true } : {}),
    }
    const upsertPayload = sub ? basePayload : { user_id: user.id, ...basePayload }

    const { error: subErr } = sub
      ? await supabase.from('user_subscriptions').update(upsertPayload).eq('user_id', user.id)
      : await supabase.from('user_subscriptions').insert(upsertPayload)

    if (subErr) { setError(subErr.message); setSaving(false); return }

    // Log admin action
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('admin_actions').insert({
      admin_user_id: session?.user?.id,
      target_user_id: user.id,
      action_type: 'comp_access',
      notes: compNote || null,
      expires_at: expiresAt.toISOString(),
    })

    setSaving(false)
    onUpdated()
  }

  const handleExtend = async () => {
    setSaving(true)
    setError(null)
    const base = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : new Date()
    const newEnd = new Date(Math.max(base, new Date()))
    newEnd.setDate(newEnd.getDate() + extendDays)

    const { error: subErr } = await supabase
      .from('user_subscriptions')
      .update({ trial_ends_at: newEnd.toISOString() })
      .eq('user_id', user.id)

    if (subErr) { setError(subErr.message); setSaving(false); return }

    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('admin_actions').insert({
      admin_user_id: session?.user?.id,
      target_user_id: user.id,
      action_type: 'extend_trial',
      notes: `Extended by ${extendDays} days`,
      expires_at: newEnd.toISOString(),
    })

    setSaving(false)
    onUpdated()
  }

  const handleCancel = async () => {
    setSaving(true)
    setError(null)
    const { error: subErr } = await supabase
      .from('user_subscriptions')
      .update({ subscription_status: 'canceled' })
      .eq('user_id', user.id)

    if (subErr) { setError(subErr.message); setSaving(false); return }

    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('admin_actions').insert({
      admin_user_id: session?.user?.id,
      target_user_id: user.id,
      action_type: 'cancel_subscription',
      notes: null,
      expires_at: null,
    })

    setSaving(false)
    onUpdated()
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    setError(null)

    // Delete subscription row first
    await supabase.from('user_subscriptions').delete().eq('user_id', user.id)

    // Delete auth user
    const { error: delErr } = await supabase.auth.admin.deleteUser(user.id)
    if (delErr) { setError(delErr.message); setSaving(false); setConfirmDelete(false); return }

    setSaving(false)
    onUpdated()
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{user.email}</h2>
            <p className="text-xs text-gray-400 mt-0.5">User detail</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 flex-1">
          {/* User info */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">User</p>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <InfoRow label="User ID" value={user.id} />
              <InfoRow label="Email" value={user.email} />
              <InfoRow label="Created" value={fmtDate(user.created_at)} />
              <InfoRow label="Last sign in" value={fmtDate(user.last_sign_in_at)} />
            </div>
          </div>

          {/* Subscription info */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Subscription</p>
              {sub && statusBadge(sub.subscription_status)}
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              {sub ? (
                <>
                  <InfoRow label="Status" value={sub.subscription_status} />
                  <InfoRow label="Trial ends" value={fmtDate(sub.trial_ends_at)} />
                  <InfoRow label="Period ends" value={fmtDate(sub.current_period_ends_at)} />
                  <InfoRow label="Stripe customer" value={sub.stripe_customer_id} />
                  <InfoRow label="Stripe sub" value={sub.stripe_subscription_id} />
                </>
              ) : (
                <p className="text-sm text-gray-400 py-3">No subscription record</p>
              )}
            </div>
          </div>

          {/* Data */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Data</p>
              {counts && (
                <div className="flex items-center gap-1.5">
                  {counts.hasRealData && (
                    <span className="px-2 py-0.5 text-[10px] rounded-full font-semibold bg-green-50 text-green-700">Real</span>
                  )}
                  {counts.hasDemoData && (
                    <span className="px-2 py-0.5 text-[10px] rounded-full font-semibold bg-blue-50 text-blue-700">Demo</span>
                  )}
                  {!counts.hasRealData && !counts.hasDemoData && (
                    <span className="px-2 py-0.5 text-[10px] rounded-full font-semibold bg-gray-100 text-gray-500">Empty</span>
                  )}
                </div>
              )}
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              {countsLoading ? (
                <p className="text-sm text-gray-400 py-3">Loading…</p>
              ) : counts ? (
                <>
                  <InfoRow label="Raw trades"      value={String(counts.trades)} />
                  <InfoRow label="Logical trades"  value={String(counts.logical)} />
                  <InfoRow label="Plans"           value={String(counts.plans)} />
                  <InfoRow label="Missed trades"   value={String(counts.missed)} />
                  <InfoRow label="Playbooks"       value={String(counts.playbooks)} />
                  <InfoRow label="Open positions"  value={String(counts.open_positions)} />
                </>
              ) : (
                <p className="text-sm text-gray-400 py-3">—</p>
              )}
            </div>

            {/* Data actions */}
            <div className="mt-3 space-y-2">
              <button
                onClick={handleSeed}
                disabled={dataSaving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-blue-200 text-sm text-blue-700 hover:bg-blue-50 transition-colors w-full disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {dataSaving && !confirmClearDemo && !confirmClearAll ? 'Seeding…' : 'Seed demo data'}
              </button>

              <button
                onClick={handleClearDemo}
                disabled={dataSaving}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-colors w-full disabled:opacity-50 border ${
                  confirmClearDemo
                    ? 'bg-amber-600 border-amber-600 text-white hover:bg-amber-700'
                    : 'border-amber-200 text-amber-700 hover:bg-amber-50'
                }`}
              >
                <Eraser className="w-4 h-4" />
                {confirmClearDemo ? 'Click again to confirm' : 'Clear demo data (is_demo=true)'}
              </button>

              <button
                onClick={handleClearAll}
                disabled={dataSaving}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-colors w-full disabled:opacity-50 border ${
                  confirmClearAll
                    ? 'bg-red-600 border-red-600 text-white hover:bg-red-700'
                    : 'border-red-200 text-red-700 hover:bg-red-50'
                }`}
              >
                <Database className="w-4 h-4" />
                {confirmClearAll ? 'Click again — wipes ALL user data' : 'Clear ALL data (nuclear)'}
              </button>

              {dataMessage && (
                <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                  {dataMessage}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Actions</p>
            <div className="space-y-2">
              {/* Stripe link */}
              {sub?.stripe_customer_id && (
                <a
                  href={`https://dashboard.stripe.com/customers/${sub.stripe_customer_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors w-full"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in Stripe
                </a>
              )}

              {/* Grant comp */}
              <button
                onClick={() => setAction(action === 'comp' ? null : 'comp')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-blue-200 text-sm text-blue-700 hover:bg-blue-50 transition-colors w-full"
              >
                <Gift className="w-4 h-4" />
                Grant complimentary access
              </button>
              {action === 'comp' && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Duration</label>
                    <select value={compMonths} onChange={e => setCompMonths(e.target.value === 'forever' ? 'forever' : Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value={1}>1 month</option>
                      <option value={3}>3 months</option>
                      <option value={6}>6 months</option>
                      <option value={12}>12 months</option>
                      <option value={24}>24 months</option>
                      <option value="forever">Forever</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Note (optional)</label>
                    <input type="text" value={compNote} onChange={e => setCompNote(e.target.value)} placeholder="Reason for comp…"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                  </div>
                  <button onClick={handleComp} disabled={saving}
                    className="w-full bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Saving…' : `Grant ${compMonths === 'forever' ? 'Forever' : `${compMonths} month${compMonths === 1 ? '' : 's'}`}`}
                  </button>
                </div>
              )}

              {/* Extend trial */}
              <button
                onClick={() => setAction(action === 'extend' ? null : 'extend')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-200 text-sm text-amber-700 hover:bg-amber-50 transition-colors w-full"
              >
                <Clock className="w-4 h-4" />
                Extend trial
              </button>
              {action === 'extend' && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Days to add</label>
                    <input type="number" min={1} max={90} value={extendDays} onChange={e => setExtendDays(Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                  </div>
                  <button onClick={handleExtend} disabled={saving}
                    className="w-full bg-amber-500 text-white text-sm font-medium py-2 rounded-lg hover:bg-amber-600 disabled:opacity-50">
                    {saving ? 'Saving…' : `Extend by ${extendDays} days`}
                  </button>
                </div>
              )}

              {/* Cancel */}
              {sub && sub.subscription_status !== 'canceled' && (
                <button
                  onClick={() => setAction(action === 'cancel' ? null : 'cancel')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-sm text-red-600 hover:bg-red-50 transition-colors w-full"
                >
                  <XCircle className="w-4 h-4" />
                  Cancel subscription
                </button>
              )}
              {action === 'cancel' && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <p className="text-sm text-red-700 mb-3">This will set the subscription status to <strong>canceled</strong>. Are you sure?</p>
                  <div className="flex gap-2">
                    <button onClick={handleCancel} disabled={saving}
                      className="flex-1 bg-red-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-red-700 disabled:opacity-50">
                      {saving ? 'Canceling…' : 'Yes, cancel'}
                    </button>
                    <button onClick={() => setAction(null)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50">
                      Abort
                    </button>
                  </div>
                </div>
              )}

              {/* Delete */}
              <button
                onClick={handleDelete}
                disabled={saving}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition-colors w-full disabled:opacity-50 ${
                  confirmDelete
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                {confirmDelete ? 'Tap again to confirm delete' : 'Delete user'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
          )}
        </div>
      </div>
    </div>
  )
}
