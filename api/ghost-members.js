const crypto = require('crypto')

function createGhostJWT(adminKey) {
  const [id, secret] = adminKey.split(':')
  const now = Math.floor(Date.now() / 1000)
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url')
  const message = `${header}.${payload}`
  const signature = crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(message).digest('base64url')
  return `${message}.${signature}`
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const adminKey = process.env.REACT_APP_GHOST_ADMIN_KEY
  if (!adminKey) return res.status(500).json({ error: 'GHOST_ADMIN_KEY not configured' })

  try {
    const token = createGhostJWT(adminKey)
    const response = await fetch(
      'https://philoinvestor.com/ghost/api/admin/members/?filter=status:paid&limit=all',
      { headers: { Authorization: `Ghost ${token}` } }
    )
    if (!response.ok) {
      const text = await response.text()
      return res.status(response.status).json({ error: `Ghost API error: ${response.status}`, detail: text.slice(0, 200) })
    }
    const { members } = await response.json()
    return res.status(200).json({ members: members || [] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
