// Per-user mutation router. Dispatches on req.body.action so we don't burn a
// serverless slot per action — Hobby caps at 12 functions deployment-wide
// and we'd otherwise need one file per mutation.
//
//   POST /api/users/[id]   { action: "comp", months, note? }
//                          { action: "extend-trial", days }
//                          { action: "cancel" }
//                          { action: "seed-demo" }
//                          { action: "clear-demo" }
//                          { action: "clear-all" }
//   DELETE /api/users/[id]
//
// data-counts (GET) is intentionally a separate file because it has no auth
// payload to share and a GET handler in the same file would muddy the router.

const { verifyAdmin } = require('../../_lib/auth')
const { supabaseAdmin } = require('../../_lib/supabase-admin')
const { readJsonBody } = require('../../_lib/req')

const FOREVER = '2099-01-01T00:00:00.000Z'

const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

// ── Action handlers ──────────────────────────────────────────────────────
// Each returns { status, body } where status is the HTTP code and body is
// the JSON payload to send. Keeps the dispatcher loop dumb.

async function compAction(userId, body, admin) {
  const { months, note } = body
  const isForever = months === 'forever'
  if (!isForever && (typeof months !== 'number' || months < 1)) {
    return { status: 400, body: { error: 'months must be a positive number or "forever"' } }
  }

  const expiresAt = isForever
    ? new Date(FOREVER)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() + months); return d })()

  const { data: existingSub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  const basePayload = {
    subscription_status: 'active',
    current_period_ends_at: expiresAt.toISOString(),
    ...(isForever ? { trial_ends_at: FOREVER, is_comped: true } : {}),
  }

  const { error: subErr } = existingSub
    ? await supabaseAdmin.from('user_subscriptions').update(basePayload).eq('user_id', userId)
    : await supabaseAdmin.from('user_subscriptions').insert({ user_id: userId, ...basePayload })

  if (subErr) return { status: 500, body: { error: subErr.message } }

  await supabaseAdmin.from('admin_actions').insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action_type: 'comp_access',
    notes: note || null,
    expires_at: expiresAt.toISOString(),
  })

  return { status: 200, body: { success: true } }
}

async function extendTrialAction(userId, body, admin) {
  const { days } = body
  if (typeof days !== 'number' || days < 1) {
    return { status: 400, body: { error: 'days must be a positive number' } }
  }

  const { data: sub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('trial_ends_at')
    .eq('user_id', userId)
    .maybeSingle()

  const base = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : new Date()
  const newEnd = new Date(Math.max(base, new Date()))
  newEnd.setDate(newEnd.getDate() + days)

  const { error: subErr } = await supabaseAdmin
    .from('user_subscriptions')
    .update({ trial_ends_at: newEnd.toISOString() })
    .eq('user_id', userId)
  if (subErr) return { status: 500, body: { error: subErr.message } }

  await supabaseAdmin.from('admin_actions').insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action_type: 'extend_trial',
    notes: `Extended by ${days} days`,
    expires_at: newEnd.toISOString(),
  })

  return { status: 200, body: { success: true, trial_ends_at: newEnd.toISOString() } }
}

async function cancelAction(userId, _body, admin) {
  const { error: subErr } = await supabaseAdmin
    .from('user_subscriptions')
    .update({ subscription_status: 'canceled' })
    .eq('user_id', userId)
  if (subErr) return { status: 500, body: { error: subErr.message } }

  await supabaseAdmin.from('admin_actions').insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action_type: 'cancel_subscription',
    notes: null,
    expires_at: null,
  })

  return { status: 200, body: { success: true } }
}

async function seedDemoAction(userId, _body, admin) {
  // Clear any stale demo data first so this is safely re-runnable. Surface
  // cleanup failures up front rather than silently inserting on top of
  // existing demo rows.
  const cleanupResults = await Promise.all([
    supabaseAdmin.from('missed_trades').delete().eq('user_id', userId),
    supabaseAdmin.from('logical_trades').delete().eq('user_id', userId).eq('is_demo', true),
    supabaseAdmin.from('open_positions').delete().eq('user_id', userId).eq('is_demo', true),
    supabaseAdmin.from('planned_trades').delete().eq('user_id', userId).eq('is_demo', true),
    supabaseAdmin.from('playbooks').delete().eq('user_id', userId).eq('is_demo', true),
  ])
  const cleanupErrors = cleanupResults.map(r => r.error?.message).filter(Boolean)
  if (cleanupErrors.length) {
    return { status: 500, body: { error: `cleanup: ${cleanupErrors.join('; ')}` } }
  }

  // ── Playbooks first ──
  const { data: playbooks, error: pbErr } = await supabaseAdmin
    .from('playbooks')
    .insert([
      { user_id: userId, name: 'Momentum Breakout', description: 'Price breaks previous swing high on above-avg volume. Entry on confirmation, target prior resistance, stop below breakout level.', is_demo: true },
      { user_id: userId, name: 'Earnings Fade',     description: 'Fade gap-up after earnings when price stalls at prior resistance. 1R target, tight stop above the gap high.', is_demo: true },
      { user_id: userId, name: 'MA30 Retracement',  description: 'Pullback to rising 30MA in established uptrend. Long on bounce, target prior high, stop below MA.', is_demo: true },
    ])
    .select('id, name')

  if (pbErr) return { status: 500, body: { error: `playbooks: ${pbErr.message}` } }
  const pbId = Object.fromEntries((playbooks || []).map(p => [p.name, p.id]))

  // ── Planned trades ──
  const { data: plans, error: plansErr } = await supabaseAdmin
    .from('planned_trades')
    .insert([
      { user_id: userId, symbol: 'NVDA', direction: 'LONG',  asset_category: 'STK', strategy: 'Momentum', planned_entry_price: 138, planned_target_price: 165, planned_stop_loss: 130, planned_quantity: 100, thesis: 'Breakout, 2R target',  playbook_id: pbId['Momentum Breakout'], is_demo: true },
      { user_id: userId, symbol: 'AAPL', direction: 'LONG',  asset_category: 'STK', strategy: 'Swing',    planned_entry_price: 183, planned_target_price: 205, planned_stop_loss: 176, planned_quantity: 50,  thesis: 'Earnings dip buy',    playbook_id: pbId['MA30 Retracement'],  is_demo: true },
      { user_id: userId, symbol: 'TSLA', direction: 'SHORT', asset_category: 'STK', strategy: 'Fade',     planned_entry_price: 252, planned_target_price: 225, planned_stop_loss: 262, planned_quantity: 30,  thesis: 'Fade gap up, 1R',     playbook_id: pbId['Earnings Fade'],     is_demo: true },
      { user_id: userId, symbol: 'SPY',  direction: 'LONG',  asset_category: 'STK', strategy: 'Trend',    planned_entry_price: 495, planned_target_price: 512, planned_stop_loss: 488, planned_quantity: 20,  thesis: 'Trend continuation',                                                   is_demo: true },
      { user_id: userId, symbol: 'MSFT', direction: 'LONG',  asset_category: 'STK', strategy: 'Swing',    planned_entry_price: 413, planned_target_price: 440, planned_stop_loss: 405, planned_quantity: 40,  thesis: 'Support bounce',      playbook_id: pbId['MA30 Retracement'],  is_demo: true },
    ])
    .select('id, symbol, direction')

  if (plansErr) return { status: 500, body: { error: `plans: ${plansErr.message}` } }
  const planId = Object.fromEntries((plans || []).map(p => [`${p.symbol}_${p.direction}`, p.id]))

  // ── Logical trades ──
  const lt = (overrides) => ({
    user_id: userId,
    asset_category: 'STK',
    status: 'closed',
    total_closing_quantity: overrides.total_opening_quantity,
    remaining_quantity: 0,
    fx_rate_to_base: 1,
    currency: 'USD',
    matching_status: 'needs_review',
    is_reversal: false,
    planned_trade_id: null,
    is_demo: true,
    ...overrides,
  })
  const ltOpen = (overrides) => ({
    user_id: userId,
    asset_category: 'STK',
    status: 'open',
    total_closing_quantity: 0,
    remaining_quantity: overrides.total_opening_quantity,
    total_realized_pnl: null,
    closed_at: null,
    fx_rate_to_base: 1,
    currency: 'USD',
    matching_status: 'off_plan',
    is_reversal: false,
    planned_trade_id: null,
    is_demo: true,
    ...overrides,
  })

  const logicalTrades = [
    lt({ symbol: 'NVDA', direction: 'LONG',  opened_at: daysAgo(6),  closed_at: daysAgo(5),  total_opening_quantity: 100, avg_entry_price: 140.00, total_realized_pnl: 1000, planned_trade_id: planId['NVDA_LONG'], matching_status: 'matched' }),
    lt({ symbol: 'NVDA', direction: 'LONG',  opened_at: daysAgo(9),  closed_at: daysAgo(8),  total_opening_quantity: 50,  avg_entry_price: 145.00, total_realized_pnl: 500 }),
    lt({ symbol: 'NVDA', direction: 'SHORT', opened_at: daysAgo(14), closed_at: daysAgo(12), total_opening_quantity: 100, avg_entry_price: 160.00, total_realized_pnl: 1200 }),
    lt({ symbol: 'NVDA', direction: 'LONG',  opened_at: daysAgo(20), closed_at: daysAgo(18), total_opening_quantity: 75,  avg_entry_price: 150.00, total_realized_pnl: -600, matching_status: 'off_plan' }),
    lt({ symbol: 'NVDA', direction: 'SHORT', opened_at: daysAgo(27), closed_at: daysAgo(25), total_opening_quantity: 80,  avg_entry_price: 155.00, total_realized_pnl: -560, matching_status: 'off_plan' }),
    lt({ symbol: 'AAPL', direction: 'LONG',  opened_at: daysAgo(4),  closed_at: daysAgo(3),  total_opening_quantity: 50,  avg_entry_price: 185.00, total_realized_pnl: 550,  planned_trade_id: planId['AAPL_LONG'], matching_status: 'matched' }),
    lt({ symbol: 'AAPL', direction: 'LONG',  opened_at: daysAgo(11), closed_at: daysAgo(10), total_opening_quantity: 100, avg_entry_price: 188.00, total_realized_pnl: 1000 }),
    lt({ symbol: 'AAPL', direction: 'LONG',  opened_at: daysAgo(17), closed_at: daysAgo(15), total_opening_quantity: 75,  avg_entry_price: 190.00, total_realized_pnl: 750 }),
    lt({ symbol: 'AAPL', direction: 'LONG',  opened_at: daysAgo(24), closed_at: daysAgo(22), total_opening_quantity: 60,  avg_entry_price: 192.00, total_realized_pnl: -420, matching_status: 'off_plan' }),
    lt({ symbol: 'TSLA', direction: 'LONG',  opened_at: daysAgo(5),  closed_at: daysAgo(4),  total_opening_quantity: 30,  avg_entry_price: 220.00, total_realized_pnl: 540 }),
    lt({ symbol: 'TSLA', direction: 'SHORT', opened_at: daysAgo(10), closed_at: daysAgo(9),  total_opening_quantity: 20,  avg_entry_price: 250.00, total_realized_pnl: 300,  planned_trade_id: planId['TSLA_SHORT'], matching_status: 'matched' }),
    lt({ symbol: 'TSLA', direction: 'LONG',  opened_at: daysAgo(18), closed_at: daysAgo(16), total_opening_quantity: 25,  avg_entry_price: 235.00, total_realized_pnl: -375, matching_status: 'off_plan' }),
    lt({ symbol: 'SPY',  direction: 'LONG',  opened_at: daysAgo(3),  closed_at: daysAgo(2),  total_opening_quantity: 20,  avg_entry_price: 500.00, total_realized_pnl: 200 }),
    lt({ symbol: 'SPY',  direction: 'LONG',  opened_at: daysAgo(22), closed_at: daysAgo(20), total_opening_quantity: 20,  avg_entry_price: 505.00, total_realized_pnl: -140, matching_status: 'off_plan' }),
    lt({ symbol: 'MSFT', direction: 'LONG',  opened_at: daysAgo(7),  closed_at: daysAgo(6),  total_opening_quantity: 40,  avg_entry_price: 420.00, total_realized_pnl: 400 }),
    lt({ symbol: 'MSFT', direction: 'LONG',  opened_at: daysAgo(21), closed_at: daysAgo(19), total_opening_quantity: 35,  avg_entry_price: 422.00, total_realized_pnl: -420, matching_status: 'off_plan' }),
    ltOpen({ symbol: 'NVDA', direction: 'LONG', opened_at: daysAgo(1), total_opening_quantity: 50,  avg_entry_price: 162.00 }),
    ltOpen({ symbol: 'AAPL', direction: 'LONG', opened_at: daysAgo(2), total_opening_quantity: 100, avg_entry_price: 193.00 }),
    ltOpen({ symbol: 'TSLA', direction: 'LONG', opened_at: daysAgo(1), total_opening_quantity: 20,  avg_entry_price: 238.00 }),
  ]

  const { error: ltErr } = await supabaseAdmin.from('logical_trades').insert(logicalTrades)
  if (ltErr) return { status: 500, body: { error: `logical_trades: ${ltErr.message}` } }

  const { error: opErr } = await supabaseAdmin.from('open_positions').insert([
    { user_id: userId, symbol: 'NVDA', asset_category: 'STK', position: 50,  avg_cost: 162.00, market_value: 8250,  unrealized_pnl: 150, currency: 'USD', fx_rate_to_base: 1, updated_at: new Date().toISOString(), is_demo: true },
    { user_id: userId, symbol: 'AAPL', asset_category: 'STK', position: 100, avg_cost: 193.00, market_value: 19500, unrealized_pnl: 200, currency: 'USD', fx_rate_to_base: 1, updated_at: new Date().toISOString(), is_demo: true },
    { user_id: userId, symbol: 'TSLA', asset_category: 'STK', position: 20,  avg_cost: 238.00, market_value: 4840,  unrealized_pnl: 80,  currency: 'USD', fx_rate_to_base: 1, updated_at: new Date().toISOString(), is_demo: true },
  ])
  if (opErr) return { status: 500, body: { error: `open_positions: ${opErr.message}` } }

  const { error: mtErr } = await supabaseAdmin.from('missed_trades').insert([
    { user_id: userId, symbol: 'META', direction: 'LONG',  strategy: 'Momentum', noted_entry_price: 495, noted_at: daysAgo(4), notes: 'Saw the breakout at 495, froze on entry. Ran to 520.',                  playbook_id: pbId['Momentum Breakout'] },
    { user_id: userId, symbol: 'GOOG', direction: 'LONG',  strategy: 'Swing',    noted_entry_price: 168, noted_at: daysAgo(9), notes: 'MA30 pullback, clean setup. Was on a call. Missed the entry.',          playbook_id: pbId['MA30 Retracement']  },
    { user_id: userId, symbol: 'AMD',  direction: 'SHORT', strategy: 'Fade',     noted_entry_price: 178, noted_at: daysAgo(2), notes: 'Gap-up fade, rejected at prior resistance. Hesitated, missed it.',       playbook_id: pbId['Earnings Fade']     },
    { user_id: userId, symbol: 'UBER', direction: 'LONG',  strategy: null,       noted_entry_price: 78,  noted_at: daysAgo(6), notes: 'Just had a gut feeling. No specific setup.',                             playbook_id: null                      },
  ])
  if (mtErr) return { status: 500, body: { error: `missed_trades: ${mtErr.message}` } }

  await supabaseAdmin
    .from('user_subscriptions')
    .update({ demo_seeded: true, has_seen_welcome: true })
    .eq('user_id', userId)

  await supabaseAdmin.from('admin_actions').insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action_type: 'seed_demo',
    notes: null,
    expires_at: null,
  })

  return { status: 200, body: { success: true } }
}

async function clearDemoAction(userId, _body, admin) {
  const errors = []
  const tryDelete = async (query, label) => {
    const { error } = await query
    if (error) errors.push(`${label}: ${error.message}`)
  }

  // logical_trade_executions / planned_trade_executions are pure join tables;
  // their FKs cascade from the parents below. playbooks FK from planned_trades
  // / missed_trades is ON DELETE SET NULL, so order doesn't matter for them.
  // missed_trades has no is_demo column — wipe all (the user-facing
  // MissedTradeSheet UI isn't shipped yet, so any row is demo-origin).
  await tryDelete(supabaseAdmin.from('missed_trades').delete().eq('user_id', userId), 'missed_trades')
  await tryDelete(supabaseAdmin.from('logical_trades').delete().eq('user_id', userId).eq('is_demo', true), 'logical_trades')
  await tryDelete(supabaseAdmin.from('open_positions').delete().eq('user_id', userId).eq('is_demo', true), 'open_positions')
  await tryDelete(supabaseAdmin.from('planned_trades').delete().eq('user_id', userId).eq('is_demo', true), 'planned_trades')
  await tryDelete(supabaseAdmin.from('playbooks').delete().eq('user_id', userId).eq('is_demo', true), 'playbooks')

  await supabaseAdmin
    .from('user_subscriptions')
    .update({ demo_seeded: false })
    .eq('user_id', userId)

  if (errors.length) return { status: 500, body: { error: errors.join('; ') } }

  await supabaseAdmin.from('admin_actions').insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action_type: 'clear_demo',
    notes: null,
    expires_at: null,
  })

  return { status: 200, body: { success: true } }
}

async function clearAllAction(userId, _body, admin) {
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

  if (errors.length) return { status: 500, body: { error: errors.join('; ') } }

  await supabaseAdmin.from('admin_actions').insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action_type: 'clear_all',
    notes: null,
    expires_at: null,
  })

  return { status: 200, body: { success: true } }
}

async function deleteUser(userId, admin) {
  // Pull email up front for the audit log (will be gone after delete)
  let targetEmail = null
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
    targetEmail = data?.user?.email || null
  } catch {}

  // Subscription row first — explicit so we don't depend on cascade behavior
  await supabaseAdmin.from('user_subscriptions').delete().eq('user_id', userId)

  const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (delErr) return { status: 500, body: { error: delErr.message } }

  // target_user_id FK uses ON DELETE CASCADE, so we can't reference the
  // deleted user. Log a free-form note instead.
  await supabaseAdmin.from('admin_actions').insert({
    admin_user_id: admin.id,
    target_user_id: null,
    action_type: 'delete_user',
    notes: `Deleted user ${userId}${targetEmail ? ` (${targetEmail})` : ''}`,
    expires_at: null,
  })

  return { status: 200, body: { success: true } }
}

const ACTIONS = {
  comp:           compAction,
  'extend-trial': extendTrialAction,
  cancel:         cancelAction,
  'seed-demo':    seedDemoAction,
  'clear-demo':   clearDemoAction,
  'clear-all':    clearAllAction,
}

module.exports = async function handler(req, res) {
  const { admin, error: authError, status: authStatus } = await verifyAdmin(req)
  if (authError) return res.status(authStatus).json({ error: authError })

  const { id: userId } = req.query
  if (!userId) return res.status(400).json({ error: 'user id required' })

  if (req.method === 'DELETE') {
    const { status, body } = await deleteUser(userId, admin)
    return res.status(status).json(body)
  }

  if (req.method === 'POST') {
    const body = readJsonBody(req)
    const fn = ACTIONS[body.action]
    if (!fn) {
      return res.status(400).json({
        error: `Unknown action "${body.action}". Expected one of: ${Object.keys(ACTIONS).join(', ')}`,
      })
    }
    const { status, body: respBody } = await fn(userId, body, admin)
    return res.status(status).json(respBody)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
