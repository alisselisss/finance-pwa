export type AppRoute =
  | { name: 'home' }
  | { name: 'savings'; accountId?: string }
  | { name: 'forecast' }
  | { name: 'history'; eventId?: string }
  | { name: 'settings' }

export function parseHash(hash: string): AppRoute {
  const raw = hash.replace(/^#/, '').replace(/^\//, '')
  const [name, id] = raw.split('/')
  if (name === 'savings') return { name: 'savings', accountId: id || undefined }
  if (name === 'forecast') return { name: 'forecast' }
  if (name === 'history') return { name: 'history', eventId: id || undefined }
  if (name === 'settings') return { name: 'settings' }
  return { name: 'home' }
}

export function toHash(route: AppRoute): string {
  if (route.name === 'savings') {
    return route.accountId ? `#/savings/${route.accountId}` : '#/savings'
  }
  if (route.name === 'history') {
    return route.eventId ? `#/history/${route.eventId}` : '#/history'
  }
  if (route.name === 'home') return '#/'
  return `#/${route.name}`
}

export function navigate(route: AppRoute) {
  window.location.hash = toHash(route)
}
