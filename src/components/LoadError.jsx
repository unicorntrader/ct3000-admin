import React from 'react'
import { RefreshCw } from 'lucide-react'

// Standard load-failure surface. Mirrors the convention used in
// ct3000-react. If `onRetry` is provided, renders a Try Again button.
export default function LoadError({ message, onRetry }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
      <p className="mb-2">{message || 'Something went wrong.'}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:text-red-900 underline"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      )}
    </div>
  )
}
