import React from 'react'

// Centered loading spinner. `inline` for inline use (no padding); default
// adds vertical padding for use as a screen-level loading state.
export default function Spinner({ inline = false }) {
  if (inline) {
    return <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
  }
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )
}
