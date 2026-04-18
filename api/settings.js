const { verifyAdmin } = require('./_lib/auth')
const { supabaseAdmin } = require('./_lib/supabase-admin')
const { readJsonBody } = require('./_lib/req')

module.exports = async function handler(req, res) {
  const { admin, error: authError, status: authStatus } = await verifyAdmin(req)
  if (authError) return res.status(authStatus).json({ error: authError })

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabaseAdmin.from('app_settings').select('*')
      if (error) throw error
      return res.status(200).json({ settings: data || [] })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (req.method === 'POST') {
    const { key, value } = readJsonBody(req)
    if (!key || typeof value === 'undefined') {
      return res.status(400).json({ error: 'key and value required' })
    }
    try {
      const { error } = await supabaseAdmin
        .from('app_settings')
        .upsert(
          { key, value: String(value), updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        )
      if (error) throw error

      await supabaseAdmin.from('admin_actions').insert({
        admin_user_id: admin.id,
        target_user_id: null,
        action_type: 'update_setting',
        notes: `${key} = ${value}`,
        expires_at: null,
      })

      return res.status(200).json({ success: true })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
