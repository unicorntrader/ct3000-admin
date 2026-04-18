const { verifyAdmin } = require('../../_lib/auth')
const { supabaseAdmin } = require('../../_lib/supabase-admin')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { admin, error: authError, status: authStatus } = await verifyAdmin(req)
  if (authError) return res.status(authStatus).json({ error: authError })

  const { id: userId } = req.query
  if (!userId) return res.status(400).json({ error: 'user id required' })

  const { error: subErr } = await supabaseAdmin
    .from('user_subscriptions')
    .update({ subscription_status: 'canceled' })
    .eq('user_id', userId)
  if (subErr) return res.status(500).json({ error: subErr.message })

  await supabaseAdmin.from('admin_actions').insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action_type: 'cancel_subscription',
    notes: null,
    expires_at: null,
  })

  return res.status(200).json({ success: true })
}
