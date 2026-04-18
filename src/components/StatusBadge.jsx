import React from 'react'

// Subscription / member status pill. Used across Users, Subscriptions, and
// the User detail panel. Padding is configurable via `size` so the same
// component fits both compact table rows and roomier detail headers.
const STYLES = {
  active:   'bg-green-50 text-green-700',
  trialing: 'bg-amber-50 text-amber-700',
  canceled: 'bg-red-50 text-red-600',
  pending:  'bg-gray-100 text-gray-500',
  none:     'bg-gray-100 text-gray-400',
}

export default function StatusBadge({ status, size = 'sm' }) {
  const cls = STYLES[status] || 'bg-gray-100 text-gray-400'
  const padding = size === 'md' ? 'px-2.5 py-1' : 'px-2 py-0.5'
  return (
    <span className={`${padding} text-xs rounded-full font-medium ${cls}`}>
      {status || 'none'}
    </span>
  )
}
