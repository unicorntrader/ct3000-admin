import { supabaseAdmin as supabase } from './supabaseClient'

// Admin-facing demo data utilities. Runs client-side using the service role
// key, which this admin panel already has configured.
//
// Seed shape matches ct3000-react/api/seed-demo.js for consistency, plus
// adds a few missed_trades rows so the admin flow covers all three features
// the Journal surfaces (taken / missed / playbooks).

// Returns a full ISO timestamp. logical_trades.opened_at / closed_at are
// timestamptz as of the 2026-04-17 schema migration, so the full
// 24-char ISO string (incl. milliseconds + Z) is accepted cleanly.
const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

/**
 * Count rows in each user-scoped table. Used by the admin detail panel to
 * show "what data does this user have."
 */
export async function getDataCounts(userId) {
  if (!userId) return null
  const countOf = async (table) => {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    return count || 0
  }
  const countDemoOf = async (table) => {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_demo', true)
    return count || 0
  }

  const [trades, logical, plans, missed, playbooks, open_pos,
         demoLogical, demoPlans, demoPlaybooks, demoOpen] = await Promise.all([
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
    (open_pos - demoOpen) +
    trades + missed > 0

  return {
    trades, logical, plans, missed, playbooks, open_positions: open_pos,
    hasDemoData, hasRealData,
  }
}

/**
 * Seed a predetermined bundle of demo data for the target user.
 * All rows marked is_demo=true so clearDemoData can remove them cleanly.
 * Returns { success: true } or { error: message }.
 */
export async function seedDemoData(userId) {
  if (!userId) return { error: 'userId is required' }

  // Clear any stale demo data first so this is safely re-runnable
  await Promise.all([
    supabase.from('missed_trades').delete().eq('user_id', userId),
    supabase.from('logical_trades').delete().eq('user_id', userId).eq('is_demo', true),
    supabase.from('open_positions').delete().eq('user_id', userId).eq('is_demo', true),
    supabase.from('planned_trades').delete().eq('user_id', userId).eq('is_demo', true),
    supabase.from('playbooks').delete().eq('user_id', userId).eq('is_demo', true),
  ])

  // ── Playbooks first — plans + missed trades can reference them ──
  const { data: playbooks, error: pbErr } = await supabase
    .from('playbooks')
    .insert([
      { user_id: userId, name: 'Momentum Breakout', description: 'Price breaks previous swing high on above-avg volume. Entry on confirmation, target prior resistance, stop below breakout level.', is_demo: true },
      { user_id: userId, name: 'Earnings Fade',     description: 'Fade gap-up after earnings when price stalls at prior resistance. 1R target, tight stop above the gap high.', is_demo: true },
      { user_id: userId, name: 'MA30 Retracement',  description: 'Pullback to rising 30MA in established uptrend. Long on bounce, target prior high, stop below MA.', is_demo: true },
    ])
    .select('id, name')

  if (pbErr) return { error: `playbooks: ${pbErr.message}` }
  const pbId = Object.fromEntries((playbooks || []).map(p => [p.name, p.id]))

  // ── Planned trades ──
  const { data: plans, error: plansErr } = await supabase
    .from('planned_trades')
    .insert([
      { user_id: userId, symbol: 'NVDA', direction: 'LONG',  asset_category: 'STK', strategy: 'Momentum', planned_entry_price: 138, planned_target_price: 165, planned_stop_loss: 130, planned_quantity: 100, thesis: 'Breakout, 2R target',  playbook_id: pbId['Momentum Breakout'], is_demo: true },
      { user_id: userId, symbol: 'AAPL', direction: 'LONG',  asset_category: 'STK', strategy: 'Swing',    planned_entry_price: 183, planned_target_price: 205, planned_stop_loss: 176, planned_quantity: 50,  thesis: 'Earnings dip buy',    playbook_id: pbId['MA30 Retracement'],  is_demo: true },
      { user_id: userId, symbol: 'TSLA', direction: 'SHORT', asset_category: 'STK', strategy: 'Fade',     planned_entry_price: 252, planned_target_price: 225, planned_stop_loss: 262, planned_quantity: 30,  thesis: 'Fade gap up, 1R',     playbook_id: pbId['Earnings Fade'],     is_demo: true },
      { user_id: userId, symbol: 'SPY',  direction: 'LONG',  asset_category: 'STK', strategy: 'Trend',    planned_entry_price: 495, planned_target_price: 512, planned_stop_loss: 488, planned_quantity: 20,  thesis: 'Trend continuation',                                                   is_demo: true },
      { user_id: userId, symbol: 'MSFT', direction: 'LONG',  asset_category: 'STK', strategy: 'Swing',    planned_entry_price: 413, planned_target_price: 440, planned_stop_loss: 405, planned_quantity: 40,  thesis: 'Support bounce',      playbook_id: pbId['MA30 Retracement'],  is_demo: true },
    ])
    .select('id, symbol, direction')

  if (plansErr) return { error: `plans: ${plansErr.message}` }
  const planId = Object.fromEntries((plans || []).map(p => [`${p.symbol}_${p.direction}`, p.id]))

  // ── Logical trades — mix of matched (to plans), off_plan, and open ──
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
    // NVDA — matched, then more
    lt({ symbol: 'NVDA', direction: 'LONG',  opened_at: daysAgo(6),  closed_at: daysAgo(5),  total_opening_quantity: 100, avg_entry_price: 140.00, total_realized_pnl: 1000, planned_trade_id: planId['NVDA_LONG'], matching_status: 'matched' }),
    lt({ symbol: 'NVDA', direction: 'LONG',  opened_at: daysAgo(9),  closed_at: daysAgo(8),  total_opening_quantity: 50,  avg_entry_price: 145.00, total_realized_pnl: 500 }),
    lt({ symbol: 'NVDA', direction: 'SHORT', opened_at: daysAgo(14), closed_at: daysAgo(12), total_opening_quantity: 100, avg_entry_price: 160.00, total_realized_pnl: 1200 }),
    lt({ symbol: 'NVDA', direction: 'LONG',  opened_at: daysAgo(20), closed_at: daysAgo(18), total_opening_quantity: 75,  avg_entry_price: 150.00, total_realized_pnl: -600, matching_status: 'off_plan' }),
    lt({ symbol: 'NVDA', direction: 'SHORT', opened_at: daysAgo(27), closed_at: daysAgo(25), total_opening_quantity: 80,  avg_entry_price: 155.00, total_realized_pnl: -560, matching_status: 'off_plan' }),
    // AAPL
    lt({ symbol: 'AAPL', direction: 'LONG',  opened_at: daysAgo(4),  closed_at: daysAgo(3),  total_opening_quantity: 50,  avg_entry_price: 185.00, total_realized_pnl: 550,  planned_trade_id: planId['AAPL_LONG'], matching_status: 'matched' }),
    lt({ symbol: 'AAPL', direction: 'LONG',  opened_at: daysAgo(11), closed_at: daysAgo(10), total_opening_quantity: 100, avg_entry_price: 188.00, total_realized_pnl: 1000 }),
    lt({ symbol: 'AAPL', direction: 'LONG',  opened_at: daysAgo(17), closed_at: daysAgo(15), total_opening_quantity: 75,  avg_entry_price: 190.00, total_realized_pnl: 750 }),
    lt({ symbol: 'AAPL', direction: 'LONG',  opened_at: daysAgo(24), closed_at: daysAgo(22), total_opening_quantity: 60,  avg_entry_price: 192.00, total_realized_pnl: -420, matching_status: 'off_plan' }),
    // TSLA
    lt({ symbol: 'TSLA', direction: 'LONG',  opened_at: daysAgo(5),  closed_at: daysAgo(4),  total_opening_quantity: 30,  avg_entry_price: 220.00, total_realized_pnl: 540 }),
    lt({ symbol: 'TSLA', direction: 'SHORT', opened_at: daysAgo(10), closed_at: daysAgo(9),  total_opening_quantity: 20,  avg_entry_price: 250.00, total_realized_pnl: 300,  planned_trade_id: planId['TSLA_SHORT'], matching_status: 'matched' }),
    lt({ symbol: 'TSLA', direction: 'LONG',  opened_at: daysAgo(18), closed_at: daysAgo(16), total_opening_quantity: 25,  avg_entry_price: 235.00, total_realized_pnl: -375, matching_status: 'off_plan' }),
    // SPY
    lt({ symbol: 'SPY',  direction: 'LONG',  opened_at: daysAgo(3),  closed_at: daysAgo(2),  total_opening_quantity: 20,  avg_entry_price: 500.00, total_realized_pnl: 200 }),
    lt({ symbol: 'SPY',  direction: 'LONG',  opened_at: daysAgo(22), closed_at: daysAgo(20), total_opening_quantity: 20,  avg_entry_price: 505.00, total_realized_pnl: -140, matching_status: 'off_plan' }),
    // MSFT
    lt({ symbol: 'MSFT', direction: 'LONG',  opened_at: daysAgo(7),  closed_at: daysAgo(6),  total_opening_quantity: 40,  avg_entry_price: 420.00, total_realized_pnl: 400 }),
    lt({ symbol: 'MSFT', direction: 'LONG',  opened_at: daysAgo(21), closed_at: daysAgo(19), total_opening_quantity: 35,  avg_entry_price: 422.00, total_realized_pnl: -420, matching_status: 'off_plan' }),
    // Open positions (Journal Open tab)
    ltOpen({ symbol: 'NVDA', direction: 'LONG', opened_at: daysAgo(1), total_opening_quantity: 50,  avg_entry_price: 162.00 }),
    ltOpen({ symbol: 'AAPL', direction: 'LONG', opened_at: daysAgo(2), total_opening_quantity: 100, avg_entry_price: 193.00 }),
    ltOpen({ symbol: 'TSLA', direction: 'LONG', opened_at: daysAgo(1), total_opening_quantity: 20,  avg_entry_price: 238.00 }),
  ]

  const { error: ltErr } = await supabase.from('logical_trades').insert(logicalTrades)
  if (ltErr) return { error: `logical_trades: ${ltErr.message}` }

  // ── Open positions (separate table, mirrors current holdings) ──
  const { error: opErr } = await supabase.from('open_positions').insert([
    { user_id: userId, symbol: 'NVDA', asset_category: 'STK', position: 50,  avg_cost: 162.00, market_value: 8250,  unrealized_pnl: 150, currency: 'USD', fx_rate_to_base: 1, updated_at: new Date().toISOString(), is_demo: true },
    { user_id: userId, symbol: 'AAPL', asset_category: 'STK', position: 100, avg_cost: 193.00, market_value: 19500, unrealized_pnl: 200, currency: 'USD', fx_rate_to_base: 1, updated_at: new Date().toISOString(), is_demo: true },
    { user_id: userId, symbol: 'TSLA', asset_category: 'STK', position: 20,  avg_cost: 238.00, market_value: 4840,  unrealized_pnl: 80,  currency: 'USD', fx_rate_to_base: 1, updated_at: new Date().toISOString(), is_demo: true },
  ])
  if (opErr) return { error: `open_positions: ${opErr.message}` }

  // ── Missed trades — setups the user spotted but did not take ──
  // (missed_trades has no is_demo column; the admin clear flow removes
  //  them all for the user rather than filtering.)
  const { error: mtErr } = await supabase.from('missed_trades').insert([
    { user_id: userId, symbol: 'META', direction: 'LONG',  strategy: 'Momentum', noted_entry_price: 495, noted_at: daysAgo(4), notes: 'Saw the breakout at 495, froze on entry. Ran to 520.',                  playbook_id: pbId['Momentum Breakout'] },
    { user_id: userId, symbol: 'GOOG', direction: 'LONG',  strategy: 'Swing',    noted_entry_price: 168, noted_at: daysAgo(9), notes: 'MA30 pullback, clean setup. Was on a call. Missed the entry.',          playbook_id: pbId['MA30 Retracement']  },
    { user_id: userId, symbol: 'AMD',  direction: 'SHORT', strategy: 'Fade',     noted_entry_price: 178, noted_at: daysAgo(2), notes: 'Gap-up fade, rejected at prior resistance. Hesitated, missed it.',       playbook_id: pbId['Earnings Fade']     },
    { user_id: userId, symbol: 'UBER', direction: 'LONG',  strategy: null,       noted_entry_price: 78,  noted_at: daysAgo(6), notes: 'Just had a gut feeling. No specific setup.',                             playbook_id: null                      },
  ])
  if (mtErr) return { error: `missed_trades: ${mtErr.message}` }

  // Flag the subscription so the user's app knows demo was seeded
  await supabase
    .from('user_subscriptions')
    .update({ demo_seeded: true, has_seen_welcome: true })
    .eq('user_id', userId)

  return { success: true }
}

/**
 * Remove all is_demo=true rows for this user, plus any admin-seeded
 * missed_trades (which has no is_demo column — we conservatively wipe all
 * missed trades for the user on demo clear since the MissedTradeSheet UI is
 * not shipped yet, so any row is demo-origin).
 */
export async function clearDemoData(userId) {
  if (!userId) return { error: 'userId is required' }

  const errors = []
  const tryDelete = async (query, label) => {
    const { error } = await query
    if (error) errors.push(`${label}: ${error.message}`)
  }

  // logical_trade_executions and planned_trade_executions are pure join
  // tables (no user_id column); their FKs to logical_trades / trades /
  // planned_trades have ON DELETE CASCADE, so deleting the parents below
  // cleans the join rows automatically.
  //
  // playbooks FK from planned_trades / missed_trades uses ON DELETE SET NULL,
  // so order doesn't matter for them.
  await tryDelete(
    supabase.from('missed_trades').delete().eq('user_id', userId),
    'missed_trades'
  )
  await tryDelete(
    supabase.from('logical_trades').delete().eq('user_id', userId).eq('is_demo', true),
    'logical_trades'
  )
  await tryDelete(
    supabase.from('open_positions').delete().eq('user_id', userId).eq('is_demo', true),
    'open_positions'
  )
  await tryDelete(
    supabase.from('planned_trades').delete().eq('user_id', userId).eq('is_demo', true),
    'planned_trades'
  )
  await tryDelete(
    supabase.from('playbooks').delete().eq('user_id', userId).eq('is_demo', true),
    'playbooks'
  )

  await supabase
    .from('user_subscriptions')
    .update({ demo_seeded: false })
    .eq('user_id', userId)

  if (errors.length) return { error: errors.join('; ') }
  return { success: true }
}

/**
 * Nuclear option — wipe ALL of a user's trading data (real + demo).
 * Does NOT delete the user account or subscription — only clears their
 * trading-app state so they start fresh. Use with strong confirm in UI.
 */
export async function clearAllUserData(userId) {
  if (!userId) return { error: 'userId is required' }

  const errors = []
  const tryDelete = async (table) => {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    if (error) errors.push(`${table}: ${error.message}`)
  }

  // logical_trade_executions / planned_trade_executions lack user_id and
  // cascade from their parents, so deleting the parents below wipes them too.
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

  if (errors.length) return { error: errors.join('; ') }
  return { success: true }
}
