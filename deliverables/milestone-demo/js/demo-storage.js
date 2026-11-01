(() => {
  const PREFIX = 'cj_ms_'
  const memory = new Map()
  let persistent = true

  const storage = {
    get(key, fallback = null) {
      const name = PREFIX + String(key)
      if (!persistent) return memory.has(name) ? memory.get(name) : fallback
      try {
        const value = window.localStorage.getItem(name)
        if (value !== null) memory.set(name, value)
        return value === null ? fallback : value
      } catch {
        persistent = false
        return memory.has(name) ? memory.get(name) : fallback
      }
    },
    set(key, value) {
      const name = PREFIX + String(key), text = String(value)
      memory.set(name, text)
      if (!persistent) return false
      try { window.localStorage.setItem(name, text); return true }
      catch { persistent = false; return false }
    },
    remove(key) {
      const name = PREFIX + String(key)
      memory.delete(name)
      if (!persistent) return
      try { window.localStorage.removeItem(name) } catch { persistent = false }
    },
    clear() {
      for (const key of [...memory.keys()]) if (key.startsWith(PREFIX)) memory.delete(key)
      if (!persistent) return
      try {
        const keys = []
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index)
          if (key && key.startsWith(PREFIX)) keys.push(key)
        }
        keys.forEach((key) => window.localStorage.removeItem(key))
      } catch { persistent = false }
    },
    get available() { return persistent },
  }

  window.MilestoneStorage = Object.freeze(storage)
  const params = new URLSearchParams(location.search)
  if (params.get('reset') === '1') {
    storage.clear()
    history.replaceState(null, '', location.pathname + '#/dashboard')
  } else if (!location.hash) {
    history.replaceState(null, '', location.pathname + location.search + '#/dashboard')
  }
})()
