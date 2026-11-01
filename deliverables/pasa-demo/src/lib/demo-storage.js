const PREFIX = 'cj_pasa_'
const MAX_SIZE = 4 * 1024 * 1024
const memory = new Map()
let persistent = true

function useMemory() {
  persistent = false
}

export const DemoStorage = {
  get(key, fallback = null) {
    const fullKey = PREFIX + String(key)
    if (!persistent) return memory.has(fullKey) ? memory.get(fullKey) : fallback
    try {
      const raw = window.localStorage.getItem(fullKey)
      if (raw === null) return fallback
      const value = JSON.parse(raw)
      memory.set(fullKey, value)
      return value
    } catch {
      useMemory()
      return memory.has(fullKey) ? memory.get(fullKey) : fallback
    }
  },
  set(key, value) {
    const fullKey = PREFIX + String(key)
    let raw
    try { raw = JSON.stringify(value) } catch { return false }
    if (raw.length > MAX_SIZE) { useMemory(); memory.set(fullKey, value); return false }
    memory.set(fullKey, value)
    if (!persistent) return true
    try { window.localStorage.setItem(fullKey, raw); return true }
    catch { useMemory(); return false }
  },
  remove(key) {
    const fullKey = PREFIX + String(key)
    memory.delete(fullKey)
    if (!persistent) return
    try { window.localStorage.removeItem(fullKey) } catch { useMemory() }
  },
  clearAll() {
    for (const key of [...memory.keys()]) if (key.startsWith(PREFIX)) memory.delete(key)
    if (!persistent) return
    try {
      const keys = []
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i)
        if (key?.startsWith(PREFIX)) keys.push(key)
      }
      keys.forEach((key) => window.localStorage.removeItem(key))
    } catch { useMemory() }
  },
  get available() { return persistent },
}
