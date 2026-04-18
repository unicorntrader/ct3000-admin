const { verifyAdmin } = require('../../_lib/auth')
const { supabaseAdmin } = require('../../_lib/supabase-admin')

// Nuclear option — wipes ALL of a user's trading data (real + demo).
// Does NOT delete the user account or subscription, only their app state.
// Confirmation is enforced in the UI; this endpoint trusts that the caller
// has already confirmed once authenticated.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { admin, error: authError, status: authStatus } = await verifyAdmin(req)
  if (authError) return res.status(authStatus).json({ error: authError })

  const { id: userId } = req.query
  if (!userId) return res.status(400).json({ error: 'user id required' })

  const errors = []
  const tryDelete = async (table) => {
    const { error } = await supabaseAdmin.from(table).delete().eq('user_id', userId)
    if (error) errors.push(`${table}: ${error.message}`)
  }

  // logical_trade_executions / planned_trade_executions lack user_id and
  // cascade from their parents, so deleting the parents below wipes them.
  for (const t of [
    'missed_trades',
    'logical_trades',
    'open_positions',
    'trades',
    'planned_trades',
    'playbooks',
    'daily_notes',
    'weekly_reviews',
  ]) {
    await tryDelete(t)
  }

  if (errors.length) return res.status(500).json({ error: errors.join('; ') })

  await supabaseAdmin.from('admin_actions').insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action_type: 'clear_all',
    notes: null,
    expires_at: null,
  })

  return res.status(200).json({ success: true })
}
