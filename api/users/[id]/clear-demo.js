const { verifyAdmin } = require('../../_lib/auth')
const { supabaseAdmin } = require('../../_lib/supabase-admin')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { admin, error: authError, status: authStatus } = await verifyAdmin(req)
  if (authError) return res.status(authStatus).json({ error: authError })

  const { id: userId } = req.query
  if (!userId) return res.status(400).json({ error: 'user id required' })

  const errors = []
  const tryDelete = async (query, label) => {
    const { error } = await query
    if (error) errors.push(`${label}: ${error.message}`)
  }

  // logical_trade_executions / planned_trade_executions are pure join tables;
  // their FKs cascade from the parents below. playbooks FK from planned_trades
  // / missed_trades is ON DELETE SET NULL, so order doesn't matter for them.
  // missed_trades has no is_demo column — wipe all (the user-facing
  // MissedTradeSheet UI isn't shipped yet, so any row is demo-origin).
  await tryDelete(
    supabaseAdmin.from('missed_trades').delete().eq('user_id', userId),
    'missed_trades'
  )
  await tryDelete(
    supabaseAdmin.from('logical_trades').delete().eq('user_id', userId).eq('is_demo', true),
    'logical_trades'
  )
  await tryDelete(
    supabaseAdmin.from('open_positions').delete().eq('user_id', userId).eq('is_demo', true),
    'open_positions'
  )
  await tryDelete(
    supabaseAdmin.from('planned_trades').delete().eq('user_id', userId).eq('is_demo', true),
    'planned_trades'
  )
  await tryDelete(
    supabaseAdmin.from('playbooks').delete().eq('user_id', userId).eq('is_demo', true),
    'playbooks'
  )

  await supabaseAdmin
    .from('user_subscriptions')
    .update({ demo_seeded: false })
    .eq('user_id', userId)

  if (errors.length) return res.status(500).json({ error: errors.join('; ') })

  await supabaseAdmin.from('admin_actions').insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action_type: 'clear_demo',
    notes: null,
    expires_at: null,
  })

  return res.status(200).json({ success: true })
}
