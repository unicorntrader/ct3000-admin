const { verifyAdmin } = require('../_lib/auth')
const { supabaseAdmin } = require('../_lib/supabase-admin')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { error: authError, status: authStatus } = await verifyAdmin(req)
  if (authError) return res.status(authStatus).json({ error: authError })

  try {
    // perPage caps results — silently truncates above this. Bump if active
    // user count grows past the cap; long-term, paginate.
    const { data: { users }, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 5000 })
    if (usersErr) throw usersErr

    const { data: subs, error: subsErr } = await supabaseAdmin
      .from('user_subscriptions')
      .select('*')
    if (subsErr) throw subsErr

    const { data: planRows, error: planErr } = await supabaseAdmin
      .from('planned_trades')
      .select('user_id')
    if (planErr) throw planErr

    const planCounts = {}
    for (const row of (planRows || [])) {
      planCounts[row.user_id] = (planCounts[row.user_id] || 0) + 1
    }

    return res.status(200).json({
      users: users || [],
      subscriptions: subs || [],
      planCounts,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
