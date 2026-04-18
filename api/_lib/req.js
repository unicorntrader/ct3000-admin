// Shared serverless request helpers.

// Parse a JSON request body regardless of whether Vercel pre-parsed it
// (req.body is an object) or left it as a raw string. Returns {} on
// missing or unparseable bodies — callers should validate required fields.
function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return {}
}

module.exports = { readJsonBody }
