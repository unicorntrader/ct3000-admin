// Server-only Supabase client. Uses SUPABASE_SECRET_KEY (BYPASSRLS).
// Never importable from React code: lives under api/_lib so the bundler
// never reaches it, and the env var has no REACT_APP_ prefix.
const { createClient } = require('@supabase/supabase-js')

const url = process.env.REACT_APP_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY

if (!url || !secret) {
  throw new Error('REACT_APP_SUPABASE_URL and SUPABASE_SECRET_KEY must be set')
}

const supabaseAdmin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

module.exports = { supabaseAdmin }
