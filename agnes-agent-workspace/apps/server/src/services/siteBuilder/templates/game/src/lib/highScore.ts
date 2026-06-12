const KEY = 'pacman-high-score'

export function getHighScore(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 0
  } catch {
    return 0
  }
}

export function saveHighScore(score: number): void {
  const current = getHighScore()
  if (score > current) {
    localStorage.setItem(KEY, String(score))
  }
}
