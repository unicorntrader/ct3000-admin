const { verifyAdmin } = require('../../_lib/auth')
const { supabaseAdmin } = require('../../_lib/supabase-admin')

// DELETE /api/users/[id] — removes the auth user + their subscription row.
// Trading data tables cascade via on delete cascade FK to auth.users.
module.exports = async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

  const { admin, error: authError, status: authStatus } = await verifyAdmin(req)
  if (authError) return res.status(authStatus).json({ error: authError })

  const { id: userId } = req.query
  if (!userId) return res.status(400).json({ error: 'user id required' })

  // Pull email up front for the audit log (will be gone after delete)
  let targetEmail = null
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
    targetEmail = data?.user?.email || null
  } catch {}

  // Subscription row first — explicit so we don't depend on cascade behavior
  await supabaseAdmin.from('user_subscriptions').delete().eq('user_id', userId)

  const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (delErr) return res.status(500).json({ error: delErr.message })

  // target_user_id FK uses on delete cascade, so we can't reference the
  // deleted user. Log a free-form note instead.
  await supabaseAdmin.from('admin_actions').insert({
    admin_user_id: admin.id,
    target_user_id: null,
    action_type: 'delete_user',
    notes: `Deleted user ${userId}${targetEmail ? ` (${targetEmail})` : ''}`,
    expires_at: null,
  })

  return res.status(200).json({ success: true })
}
