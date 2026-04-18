// Server-side admin gate for /api/* routes.
//
// Flow: client signs in via supabase.auth.signInWithPassword (publishable key),
// sends the resulting access_token as `Authorization: Bearer <jwt>`. We
// verify the JWT against Supabase using the publishable key (no secret needed
// for verification) and check the email against the server-side ADMIN_EMAILS
// allowlist. Only after this passes does the route get to use the secret key.
const { createClient } = require('@supabase/supabase-js')

const url = process.env.REACT_APP_SUPABASE_URL
const publishable = process.env.REACT_APP_SUPABASE_ANON_KEY

const verifyClient = createClient(url, publishable, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

// Parsed at module load (Vercel reuses the warm function instance across
// requests). Updating ADMIN_EMAILS in Vercel requires a redeploy to take
// effect — env var changes don't hot-reload.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

async function verifyAdmin(req) {
  const header = req.headers.authorization || req.headers.Authorization || ''
  const jwt = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!jwt) return { error: 'Missing bearer token', status: 401 }

  const { data, error } = await verifyClient.auth.getUser(jwt)
  if (error || !data?.user) return { error: 'Invalid session', status: 401 }

  const email = data.user.email?.toLowerCase()
  if (!email || !ADMIN_EMAILS.includes(email)) {
    return { error: 'Forbidden', status: 403 }
  }

  return { admin: data.user }
}

module.exports = { verifyAdmin }
