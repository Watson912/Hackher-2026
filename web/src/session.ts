// Who's using the app. Kept in localStorage so a refresh stays signed in;
// every access is wrapped because storage can be blocked or empty.
export interface CurrentUser {
  userId: number
  firstName: string
  isDemo: boolean
}

const KEY = 'healthher.user'

export function loadCurrentUser(): CurrentUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as CurrentUser) : null
  } catch {
    return null
  }
}

export function saveCurrentUser(user: CurrentUser | null) {
  try {
    if (user) localStorage.setItem(KEY, JSON.stringify(user))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage unavailable: the app still works, it just won't survive a refresh.
  }
}
