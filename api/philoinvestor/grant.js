const crypto = require('crypto')
const { verifyAdmin } = require('../_lib/auth')
const { supabaseAdmin } = require('../_lib/supabase-admin')
const { readJsonBody } = require('../_lib/req')
const { INVITE_BASE_URL } = require('../_lib/constants')

// POST /api/philoinvestor/grant
// Body: { email, ghostMemberId, periodEnd? }
// Two paths:
//   - Email already maps to a Supabase user → activate their CT3000 sub
//     (subscription_status=active, current_period_ends_at=periodEnd).
//   - Otherwise → create an invited_users row with a fresh token and return
//     the invite link for the admin to send.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { admin, error: authError, status: authStatus } = await verifyAdmin(req)
  if (authError) return res.status(authStatus).json({ error: authError })

  const { email, ghostMemberId, periodEnd } = readJsonBody(req)
  if (!email) return res.status(400).json({ error: 'email required' })

  // Look up user by email. Supabase doesn't expose getUserByEmail directly,
  // so we list and filter. perPage cap matches the other endpoints.
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 5000 })
  const supaUser = (users || []).find(u => u.email?.toLowerCase() === email.toLowerCase())

  if (supaUser) {
    // Existing user — comp them
    const { data: existingSub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('id')
      .eq('user_id', supaUser.id)
      .maybeSingle()

    const payload = {
      subscription_status: 'active',
      current_period_ends_at: periodEnd || null,
      trial_ends_at: null,
    }

    const { error: subErr } = existingSub
      ? await supabaseAdmin.from('user_subscriptions').update(payload).eq('user_id', supaUser.id)
      : await supabaseAdmin.from('user_subscriptions').insert({ user_id: supaUser.id, ...payload })

    if (subErr) return res.status(500).json({ error: subErr.message })

    await supabaseAdmin.from('admin_actions').insert({
      admin_user_id: admin.id,
      target_user_id: supaUser.id,
      action_type: 'comp_access',
      notes: `Philoinvestor Ghost member — ghost_id:${ghostMemberId || '?'}`,
      expires_at: periodEnd || null,
    })

    return res.status(200).json({ status: 'granted', userId: supaUser.id })
  }

  // No Supabase user yet — create invite
  const token = crypto.randomUUID()
  const { error: inviteErr } = await supabaseAdmin
    .from('invited_users')
    .insert({ email, token, is_comped: true })
  if (inviteErr) return res.status(500).json({ error: inviteErr.message })

  return res.status(200).json({ status: 'invited', inviteUrl: INVITE_BASE_URL + token })
}
