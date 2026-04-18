const crypto = require('crypto')
const { verifyAdmin } = require('./_lib/auth')
const { supabaseAdmin } = require('./_lib/supabase-admin')
const { readJsonBody } = require('./_lib/req')

module.exports = async function handler(req, res) {
  const { admin, error: authError, status: authStatus } = await verifyAdmin(req)
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

  if (req.method === 'POST') {
    const { email, isComped } = readJsonBody(req)
    if (!email) return res.status(400).json({ error: 'email required' })

    try {
      const token = crypto.randomUUID()
      const { error } = await supabaseAdmin
        .from('invited_users')
        .insert({ email, token, is_comped: !!isComped })
      if (error) throw error

      await supabaseAdmin.from('admin_actions').insert({
        admin_user_id: admin.id,
        target_user_id: null,
        action_type: 'create_invite',
        notes: `Invited ${email}${isComped ? ' (comped)' : ''}`,
        expires_at: null,
      })

      return res.status(200).json({ token })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
