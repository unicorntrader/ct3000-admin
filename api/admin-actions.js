const { verifyAdmin } = require('./_lib/auth')
const { supabaseAdmin } = require('./_lib/supabase-admin')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { error: authError, status: authStatus } = await verifyAdmin(req)
  if (authError) return res.status(authStatus).json({ error: authError })

  try {
    const { data: actions, error: actErr } = await supabaseAdmin
      .from('admin_actions')
      .select('*')
      .order('created_at', { ascending: false })
    if (actErr) throw actErr

    const { data: { users }, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    if (usersErr) throw usersErr

    const emailMap = {}
    for (const u of (users || [])) emailMap[u.id] = u.email

    return res.status(200).json({ actions: actions || [], emailMap })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
