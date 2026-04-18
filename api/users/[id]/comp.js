const { verifyAdmin } = require('../../_lib/auth')
const { supabaseAdmin } = require('../../_lib/supabase-admin')
const { readJsonBody } = require('../../_lib/req')

const FOREVER = '2099-01-01T00:00:00.000Z'

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { admin, error: authError, status: authStatus } = await verifyAdmin(req)
  if (authError) return res.status(authStatus).json({ error: authError })

  const { id: userId } = req.query
  if (!userId) return res.status(400).json({ error: 'user id required' })

  const { months, note } = readJsonBody(req)
  const isForever = months === 'forever'
  if (!isForever && (typeof months !== 'number' || months < 1)) {
    return res.status(400).json({ error: 'months must be a positive number or "forever"' })
  }

  const expiresAt = isForever
    ? new Date(FOREVER)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() + months); return d })()

  // Check whether a sub already exists
  const { data: existingSub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  const basePayload = {
    subscription_status: 'active',
    current_period_ends_at: expiresAt.toISOString(),
    ...(isForever ? { trial_ends_at: FOREVER, is_comped: true } : {}),
  }

  const { error: subErr } = existingSub
    ? await supabaseAdmin.from('user_subscriptions').update(basePayload).eq('user_id', userId)
    : await supabaseAdmin.from('user_subscriptions').insert({ user_id: userId, ...basePayload })

  if (subErr) return res.status(500).json({ error: subErr.message })

  await supabaseAdmin.from('admin_actions').insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action_type: 'comp_access',
    notes: note || null,
    expires_at: expiresAt.toISOString(),
  })

  return res.status(200).json({ success: true })
}
