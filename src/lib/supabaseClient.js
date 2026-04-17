import { createClient } from '@supabase/supabase-js'

// Admin panel uses the service role key to bypass RLS and access auth.users
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseKey = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase env vars not set. REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_SERVICE_ROLE_KEY required.')
}

// Default client: persists the admin's login session. The JWT from login is
// used as the Authorization header for DB queries, which means PostgREST
// evaluates RLS under the admin user's identity (role=authenticated).
// Good for auth.admin.* calls (which use the apikey, not the JWT), and for
// DB reads where RLS is permissive (admin can see everyone's stuff via
// dashboards etc.).
export const supabase = createClient(supabaseUrl, supabaseKey)

// Admin-bypass client: same service role key but no session persistence.
// With no session, the Authorization header falls back to the apikey
// (service_role), which has BYPASSRLS. Use this for DB writes that would
// otherwise trip row-level security -- e.g. inserting rows on behalf of
// another user (demo data seeding, bulk edits).
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
