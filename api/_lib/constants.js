// Server-side mirror of src/lib/constants.js. Two-file duplication is cheaper
// than sharing a module across the CRA (ESM) / Vercel functions (CJS) boundary.

const INVITE_BASE_URL =
  process.env.INVITE_BASE_URL ||
  'https://ct3000-react.vercel.app/signup?invite='

const MRR_PER_USER = 30

module.exports = { INVITE_BASE_URL, MRR_PER_USER }
