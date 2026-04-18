// Shared date formatters. Two flavors:
//   fmtDate    — "Apr 18, 2026"            (table cells, list rows)
//   fmtDateTime — "Apr 18, 2026, 02:14 PM" (detail panels, audit timestamps)

export const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export const fmtDateTime = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// "Apr 18, 02:14 PM" — used on the Dashboard activity feed.
export const fmtTime = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
