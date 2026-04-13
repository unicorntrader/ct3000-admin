const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
)

function verifySignature(rawBody, header, secret) {
  // Ghost header format: "sha256=<hex>, t=<timestamp>"
  const parts = {}
  header.split(',').forEach(part => {
    const [k, v] = part.trim().split('=')
    parts[k] = v
  })
  const { sha256: expected, t: timestamp } = parts
  if (!expected || !timestamp) return false
  const computed = crypto.createHmac('sha256', secret).update(rawBody + timestamp).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function findUserByEmail(email) {
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  return users?.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const rawBodyBuf = await getRawBody(req)
  const rawBody = rawBodyBuf.toString('utf8')

  const webhookSecret = process.env.GHOST_WEBHOOK_SECRET
  if (webhookSecret) {
    const sig = req.headers['x-ghost-signature']
    if (!sig || !verifySignature(rawBody, sig, webhookSecret)) {
      console.error('[ghost-webhook] invalid signature')
      return res.status(401).json({ error: 'Invalid signature' })
    }
  }

  let payload
  try { payload = JSON.parse(rawBody) } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const current = payload.member?.current
  const previous = payload.member?.previous

  if (!current?.email) return res.status(200).json({ received: true })

  const email = current.email
  const currentStatus = current.status   // 'paid' | 'free' | 'comped'
  const previousStatus = previous?.status

  console.log(`[ghost-webhook] ${email} status: ${previousStatus} → ${currentStatus}`)

  const user = await findUserByEmail(email)
  if (!user) {
    console.log(`[ghost-webhook] no Supabase user found for ${email}`)
    return res.status(200).json({ received: true })
  }

  // Check if user is manually comped — don't touch them
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('is_comped, subscription_status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (sub?.is_comped) {
    console.log(`[ghost-webhook] user ${email} is manually comped — skipping`)
    return res.status(200).json({ received: true })
  }

  if (currentStatus === 'paid') {
    // Member is (or became) paid — activate CT3000
    const periodEnd = current.subscriptions?.[0]?.current_period_end || null
    const { error } = await supabase
      .from('user_subscriptions')
      .upsert(
        { user_id: user.id, subscription_status: 'active', current_period_ends_at: periodEnd },
        { onConflict: 'user_id' }
      )
    if (error) console.error('[ghost-webhook] activate error:', error.message)
    else console.log(`[ghost-webhook] activated CT3000 for ${email}, period end: ${periodEnd}`)
  } else {
    // Member is no longer paid — cancel CT3000
    const { error } = await supabase
      .from('user_subscriptions')
      .update({ subscription_status: 'canceled' })
      .eq('user_id', user.id)
    if (error) console.error('[ghost-webhook] cancel error:', error.message)
    else console.log(`[ghost-webhook] canceled CT3000 for ${email}`)
  }

  return res.status(200).json({ received: true })
}

module.exports.config = { api: { bodyParser: false } }
