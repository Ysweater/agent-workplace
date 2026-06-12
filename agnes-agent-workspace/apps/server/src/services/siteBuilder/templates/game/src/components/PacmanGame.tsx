import { useCallback, useEffect, useRef, useState } from 'react'
import { getHighScore, saveHighScore } from '../lib/highScore'

const TILE = 20
const COLS = 19
const ROWS = 15
const TICK_MS = 220

// 0 path, 1 wall, 2 dot
const MAZE: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,1,1,2,1,2,1,1,1,2,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,2,1,1,1,1,1,2,1,2,1,1,2,1],
  [1,2,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,2,1],
  [1,1,1,1,2,1,1,1,0,1,0,1,1,1,2,1,1,1,1],
  [0,0,0,1,2,1,0,0,0,0,0,0,0,1,2,1,0,0,0],
  [1,1,1,1,2,1,0,1,1,0,1,1,0,1,2,1,1,1,1],
  [0,0,0,0,2,0,0,1,0,0,0,1,0,0,2,0,0,0,0],
  [1,1,1,1,2,1,0,1,1,1,1,1,0,1,2,1,1,1,1],
  [0,0,0,1,2,1,0,0,0,0,0,0,0,1,2,1,0,0,0],
  [1,1,1,1,2,1,0,1,1,1,1,1,0,1,2,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
]

type Dir = 'up' | 'down' | 'left' | 'right'
type Phase = 'ready' | 'playing' | 'won' | 'lost'

interface Entity { x: number; y: number; dir: Dir }

interface GameState {
  maze: number[][]
  player: Entity
  ghosts: Entity[]
  score: number
  lives: number
  phase: Phase
  nextDir: Dir
  collisionCooldown: number
}

const DIRS: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

function cloneMaze(): number[][] {
  return MAZE.map((row) => [...row])
}

function canMove(maze: number[][], x: number, y: number, dir: Dir): boolean {
  const { dx, dy } = DIRS[dir]
  const nx = x + dx
  const ny = y + dy
  if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return false
  return maze[ny][nx] !== 1
}

function countDots(maze: number[][]): number {
  return maze.flat().filter((c) => c === 2).length
}

function ghostColor(i: number): string {
  return ['#ef4444', '#a855f7', '#22d3ee', '#f97316'][i % 4]
}

function moveEntity(mazeGrid: number[][], ent: Entity, prefer: Dir): Entity {
  const tryDirs = [prefer, ent.dir, 'up', 'down', 'left', 'right'] as Dir[]
  for (const d of tryDirs) {
    if (canMove(mazeGrid, ent.x, ent.y, d)) {
      const { dx, dy } = DIRS[d]
      return { x: ent.x + dx, y: ent.y + dy, dir: d }
    }
  }
  return ent
}

function moveInDir(ent: Entity, dir: Dir): Entity {
  const { dx, dy } = DIRS[dir]
  return { x: ent.x + dx, y: ent.y + dy, dir }
}

function availableDirs(mazeGrid: number[][], ent: Entity): Dir[] {
  return (['up', 'down', 'left', 'right'] as Dir[]).filter((dir) =>
    canMove(mazeGrid, ent.x, ent.y, dir),
  )
}

function manhattan(a: Entity, b: Entity): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function chooseGhostDir(mazeGrid: number[][], ghost: Entity, player: Entity, tick: number, index: number): Dir {
  const dirs = availableDirs(mazeGrid, ghost)
  if (dirs.length === 0) return ghost.dir

  const noReverse = dirs.filter((dir) => dir !== OPPOSITE[ghost.dir])
  const candidates = noReverse.length > 0 ? noReverse : dirs
  const ranked = [...candidates].sort(
    (a, b) => manhattan(moveInDir(ghost, a), player) - manhattan(moveInDir(ghost, b), player),
  )

  if ((tick + index) % 5 === 0 && ranked.length > 1) {
    return ranked[1]
  }
  if ((tick + index) % 11 === 0) {
    return candidates[(tick + index) % candidates.length]
  }
  return ranked[0]
}

function sameTile(a: Entity, b: Entity): boolean {
  return a.x === b.x && a.y === b.y
}

function swappedTiles(playerBefore: Entity, playerAfter: Entity, ghostBefore: Entity, ghostAfter: Entity): boolean {
  return sameTile(playerBefore, ghostAfter) && sameTile(playerAfter, ghostBefore)
}

function createInitialState(): GameState {
  return {
    maze: cloneMaze(),
    player: { x: 9, y: 7, dir: 'left' },
    ghosts: [
      { x: 8, y: 7, dir: 'right' },
      { x: 10, y: 7, dir: 'left' },
    ],
    score: 0,
    lives: 3,
    phase: 'ready',
    nextDir: 'left',
    collisionCooldown: 0,
  }
}

export default function PacmanGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<GameState>(createInitialState())
  const tickRef = useRef(0)
  const mouthRef = useRef(0.35)

  const [maze, setMaze] = useState<number[][]>(() => cloneMaze())
  const [player, setPlayer] = useState<Entity>({ x: 9, y: 7, dir: 'left' })
  const [ghosts, setGhosts] = useState<Entity[]>([
    { x: 8, y: 7, dir: 'right' },
    { x: 10, y: 7, dir: 'left' },
  ])
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [phase, setPhase] = useState<Phase>('ready')
  const [highScore, setHighScore] = useState(() => getHighScore())

  const syncFromRef = useCallback((g: GameState) => {
    setMaze(g.maze.map((row) => [...row]))
    setPlayer({ ...g.player })
    setGhosts(g.ghosts.map((ghost) => ({ ...ghost })))
    setScore(g.score)
    setLives(g.lives)
    setPhase(g.phase)
    setHighScore(getHighScore())
  }, [])

  const resetPositions = useCallback((g: GameState) => {
    g.player = { x: 9, y: 7, dir: 'left' }
    g.ghosts = [
      { x: 8, y: 7, dir: 'right' },
      { x: 10, y: 7, dir: 'left' },
    ]
    g.nextDir = 'left'
    g.collisionCooldown = 2
    tickRef.current = 0
  }, [])

  const startGame = useCallback(() => {
    const g = createInitialState()
    g.phase = 'playing'
    gameRef.current = g
    syncFromRef(g)
  }, [syncFromRef])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
      }
      const dir = map[e.key]
      if (!dir) {
        if (e.key === ' ' && (gameRef.current.phase === 'won' || gameRef.current.phase === 'lost')) {
          startGame()
        }
        return
      }
      e.preventDefault()
      const g = gameRef.current
      if (g.phase === 'ready') {
        startGame()
        g.nextDir = dir
        return
      }
      if (g.phase === 'playing') {
        g.nextDir = dir
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startGame])

  useEffect(() => {
    const id = window.setInterval(() => {
      const g = gameRef.current
      if (g.phase !== 'playing') return

      tickRef.current += 1
      const nextMaze = g.maze.map((row) => [...row])
      const previousPlayer = { ...g.player }
      const previousGhosts = g.ghosts.map((ghost) => ({ ...ghost }))
      const prevX = g.player.x
      const prevY = g.player.y
      const moved = moveEntity(nextMaze, g.player, g.nextDir)

      if (moved.x !== prevX || moved.y !== prevY) {
        const cell = nextMaze[moved.y][moved.x]
        if (cell === 2) {
          nextMaze[moved.y][moved.x] = 0
          g.score += 10
          saveHighScore(g.score)
        }
      }

      g.player = moved
      g.maze = nextMaze

      g.ghosts = g.ghosts.map((ghost, i) => {
        const pick = chooseGhostDir(nextMaze, ghost, g.player, tickRef.current, i)
        return moveInDir(ghost, pick)
      })

      if (g.collisionCooldown > 0) {
        g.collisionCooldown -= 1
      }

      const collided =
        g.collisionCooldown === 0 &&
        g.ghosts.some((ghost, index) =>
          sameTile(ghost, g.player) ||
          swappedTiles(previousPlayer, g.player, previousGhosts[index], ghost),
        )

      if (collided) {
        g.lives -= 1
        if (g.lives <= 0) {
          g.phase = 'lost'
        } else {
          resetPositions(g)
        }
      }

      if (g.phase === 'playing' && countDots(nextMaze) === 0) {
        g.phase = 'won'
      }

      syncFromRef(g)
    }, TICK_MS)

    return () => window.clearInterval(id)
  }, [resetPositions, syncFromRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let raf = 0
    const draw = () => {
      mouthRef.current = 0.2 + Math.abs(Math.sin(Date.now() / 120)) * 0.35
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            const cell = maze[y][x]
            const px = x * TILE
            const py = y * TILE
            if (cell === 1) {
              ctx.fillStyle = '#1e40af'
              ctx.fillRect(px, py, TILE, TILE)
            } else if (cell === 2) {
              ctx.fillStyle = '#fde68a'
              ctx.beginPath()
              ctx.arc(px + TILE / 2, py + TILE / 2, 3, 0, Math.PI * 2)
              ctx.fill()
            }
          }
        }
        const cx = player.x * TILE + TILE / 2
        const cy = player.y * TILE + TILE / 2
        const r = TILE / 2 - 2
        const rot: Record<Dir, number> = {
          right: 0, down: 0.5 * Math.PI, left: Math.PI, up: -0.5 * Math.PI,
        }
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(rot[player.dir])
        ctx.fillStyle = '#facc15'
        ctx.beginPath()
        ctx.arc(0, 0, r, mouthRef.current, -mouthRef.current, true)
        ctx.lineTo(0, 0)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
        ghosts.forEach((ghost, i) => {
          ctx.fillStyle = ghostColor(i)
          ctx.beginPath()
          ctx.arc(ghost.x * TILE + TILE / 2, ghost.y * TILE + TILE / 2, TILE / 2 - 2, 0, Math.PI * 2)
          ctx.fill()
        })
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [maze, player, ghosts])

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap justify-center gap-6 text-sm font-medium text-gray-200">
        <span>得分: {score}</span>
        <span>最高: {highScore}</span>
        <span>生命: {'❤'.repeat(Math.max(lives, 0))}</span>
      </div>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        width={COLS * TILE}
        height={ROWS * TILE}
        className="rounded-lg border-4 border-blue-900 shadow-lg max-w-full outline-none focus:ring-2 focus:ring-yellow-400/50"
      />
      <div className="text-center text-sm text-gray-400 max-w-md">
        {phase === 'ready' && <p>按方向键或 WASD 开始游戏</p>}
        {phase === 'playing' && <p>吃掉所有豆子，躲开幽灵！</p>}
        {phase === 'won' && <p className="text-green-400 font-bold">胜利！按空格再来一局</p>}
        {phase === 'lost' && <p className="text-red-400 font-bold">游戏结束，按空格重试</p>}
      </div>
      <button
        type="button"
        onClick={startGame}
        className="px-6 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-300"
      >
        {phase === 'ready' ? '开始游戏' : '重新开始'}
      </button>
    </div>
  )
}
