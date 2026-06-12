import { useEffect } from 'react'
import PacmanGame from './components/PacmanGame'

export default function App() {
  useEffect(() => {
    document.title = '复古吃豆人'
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="text-center py-6 px-4 border-b border-slate-700">
        <h1 className="text-3xl font-bold text-yellow-400">复古吃豆人</h1>
        <p className="text-slate-400 mt-2 text-sm max-w-lg mx-auto">
          Agnes Agent Workspace · 一键本地建站（源自 ai-site-builder 模板）
        </p>
      </header>
      <main className="py-8 px-4 flex justify-center">
        <PacmanGame />
      </main>
    </div>
  )
}
