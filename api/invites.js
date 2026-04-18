const { verifyAdmin } = require('./_lib/auth')
const { supabaseAdmin } = require('./_lib/supabase-admin')

module.exports = async function handler(req, res) {
  const { error: authError, status: authStatus } = await verifyAdmin(req)
  if (authError) return res.status(authStatus).json({ error: authError })

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabaseAdmin
        .from('invited_users')
        .select('id, email, token, invited_at')
        .is('redeemed_at', null)
        .order('invited_at', { ascending: false })
      if (error) throw error
      return res.status(200).json({ invites: data || [] })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
