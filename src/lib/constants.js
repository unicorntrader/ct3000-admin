// Shared client-side constants. Mirrored on the server in api/_lib/constants.js
// (CommonJS, since serverless functions use CJS while CRA uses ESM — duplicating
// two values is cheaper than setting up shared-module tooling).

// Base URL the invite signup link resolves to. Set REACT_APP_INVITE_BASE_URL
// in Vercel to override (e.g. when ct3000-react moves off vercel.app).
export const INVITE_BASE_URL =
  process.env.REACT_APP_INVITE_BASE_URL ||
  'https://ct3000-react.vercel.app/signup?invite='

// Monthly recurring revenue per active subscriber, in USD. Used for MRR
// calculations on Dashboard + Subscriptions screens. Keep in sync with
// api/_lib/constants.js.
export const MRR_PER_USER = 30
