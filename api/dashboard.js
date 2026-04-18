const { verifyAdmin } = require('./_lib/auth')
const { supabaseAdmin } = require('./_lib/supabase-admin')

const MRR_PER_USER = 30

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { error: authError, status: authStatus } = await verifyAdmin(req)
  if (authError) return res.status(authStatus).json({ error: authError })

  try {
    const { data: { users }, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    if (usersErr) throw usersErr

    const { data: subs, error: subsErr } = await supabaseAdmin
      .from('user_subscriptions')
      .select('*')
    if (subsErr) throw subsErr

    const now = Date.now()
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

    const totalUsers = users.length
    const newLast7 = users.filter(u => new Date(u.created_at).getTime() >= sevenDaysAgo).length
    const newLast30 = users.filter(u => new Date(u.created_at).getTime() >= thirtyDaysAgo).length

    const active = subs.filter(s => s.subscription_status === 'active').length
    const trialing = subs.filter(s => s.subscription_status === 'trialing').length
    const canceled = subs.filter(s => s.subscription_status === 'canceled').length
    const mrr = active * MRR_PER_USER

    const converted = active + canceled
    const conversionRate = converted > 0 ? Math.round((active / converted) * 100) : null

    const stats = { totalUsers, newLast7, newLast30, active, trialing, canceled, mrr, conversionRate }

    const recentSignups = [...users]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)
      .map(u => ({ type: 'signup', email: u.email, time: u.created_at }))

    const recentSubs = [...subs]
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 5)
      .map(s => {
        const u = users.find(x => x.id === s.user_id)
        return { type: 'subscription', email: u?.email || s.user_id, status: s.subscription_status, time: s.updated_at }
      })

    const activity = [...recentSignups, ...recentSubs]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 10)

    return res.status(200).json({ stats, activity })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
