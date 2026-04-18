const { verifyAdmin } = require('../../_lib/auth')
const { supabaseAdmin } = require('../../_lib/supabase-admin')
const { readJsonBody } = require('../../_lib/req')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { admin, error: authError, status: authStatus } = await verifyAdmin(req)
  if (authError) return res.status(authStatus).json({ error: authError })

  const { id: userId } = req.query
  if (!userId) return res.status(400).json({ error: 'user id required' })

  const { days } = readJsonBody(req)
  if (typeof days !== 'number' || days < 1) {
    return res.status(400).json({ error: 'days must be a positive number' })
  }

  // Read current trial_ends_at so we extend from whichever is later: now or trial_ends_at
  const { data: sub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('trial_ends_at')
    .eq('user_id', userId)
    .maybeSingle()

  const base = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : new Date()
  const newEnd = new Date(Math.max(base, new Date()))
  newEnd.setDate(newEnd.getDate() + days)

  const { error: subErr } = await supabaseAdmin
    .from('user_subscriptions')
    .update({ trial_ends_at: newEnd.toISOString() })
    .eq('user_id', userId)
  if (subErr) return res.status(500).json({ error: subErr.message })

  await supabaseAdmin.from('admin_actions').insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action_type: 'extend_trial',
    notes: `Extended by ${days} days`,
    expires_at: newEnd.toISOString(),
  })

  return res.status(200).json({ success: true, trial_ends_at: newEnd.toISOString() })
}
