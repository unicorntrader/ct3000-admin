const { verifyAdmin } = require('../../_lib/auth')
const { supabaseAdmin } = require('../../_lib/supabase-admin')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { error: authError, status: authStatus } = await verifyAdmin(req)
  if (authError) return res.status(authStatus).json({ error: authError })

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'user id required' })

  const countOf = async (table) => {
    const { count } = await supabaseAdmin
      .from(table).select('id', { count: 'exact', head: true }).eq('user_id', id)
    return count || 0
  }
  const countDemoOf = async (table) => {
    const { count } = await supabaseAdmin
      .from(table).select('id', { count: 'exact', head: true }).eq('user_id', id).eq('is_demo', true)
    return count || 0
  }

  try {
    const [
      trades, logical, plans, missed, playbooks, openPos,
      demoLogical, demoPlans, demoPlaybooks, demoOpen,
    ] = await Promise.all([
      countOf('trades'),
      countOf('logical_trades'),
      countOf('planned_trades'),
      countOf('missed_trades'),
      countOf('playbooks'),
      countOf('open_positions'),
      countDemoOf('logical_trades'),
      countDemoOf('planned_trades'),
      countDemoOf('playbooks'),
      countDemoOf('open_positions'),
    ])

    const hasDemoData = demoLogical + demoPlans + demoPlaybooks + demoOpen > 0
    const hasRealData =
      (logical - demoLogical) +
      (plans - demoPlans) +
      (playbooks - demoPlaybooks) +
      (openPos - demoOpen) +
      trades + missed > 0

    return res.status(200).json({
      trades,
      logical,
      plans,
      missed,
      playbooks,
      open_positions: openPos,
      hasDemoData,
      hasRealData,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
