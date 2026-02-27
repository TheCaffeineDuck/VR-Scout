import { useNavigate } from 'react-router-dom'

export function AdminPlaceholder() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="text-gray-400 hover:text-white text-sm mb-6 inline-block"
        >
          &larr; Back to Launcher
        </button>
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-gray-500 mt-2">
          Property management, uploads, and QC — coming in Phase 2
        </p>
      </div>
    </div>
  )
}
