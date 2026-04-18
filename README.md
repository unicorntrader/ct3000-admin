# ct3000-admin

Admin control panel for the [ct3000](https://github.com/unicorntrader/ct3000-react)
trading app. Manages users, subscriptions, comp/promo grants, Ghost
(Philoinvestor) member sync, and per-user demo data.

## Architecture

- React 19 (Create React App) + Tailwind v3.
- Talks to the same Supabase project as ct3000-react. Browser uses the
  publishable key only — every privileged operation goes through `/api/*`
  serverless routes that hold `SUPABASE_SECRET_KEY` server-side.
- Admin authorization: client signs in via `supabase.auth.signInWithPassword`,
  sends the access token as `Authorization: Bearer <jwt>`. `api/_lib/auth.js`
  verifies the token and checks the email against the `ADMIN_EMAILS` env var.
- Every mutation writes a row to the `admin_actions` table for audit.

## Local setup

```bash
cp .env.example .env.local
# fill in the values
npm install
npm start          # http://localhost:3000
```

To exercise the `/api/*` routes locally, install the Vercel CLI and run
`vercel dev` instead of `npm start`.

## Deploy

Push to `main` → Vercel auto-deploys production. Pushing any other branch
creates a preview deployment.

## Env vars

See [.env.example](.env.example) for the full list with comments.
