/**
 * Media Timer Utilities
 * Helper functions for calculating and formatting 24-hour countdown timers
 */

export interface TimeRemaining {
  hours: number
  minutes: number
  seconds: number
  totalMs: number
  isExpired: boolean
  isUrgent: boolean // Under 1 hour
}

/**
 * Calculate time remaining until media expires
 */
export function getTimeRemaining(expiryAt: string | null): TimeRemaining | null {
  if (!expiryAt) return null

  const now = new Date().getTime()
  const expiry = new Date(expiryAt).getTime()
  const totalMs = expiry - now

  if (totalMs <= 0) {
    return {
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalMs: 0,
      isExpired: true,
      isUrgent: true,
    }
  }

  const hours = Math.floor(totalMs / (1000 * 60 * 60))
  const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((totalMs % (1000 * 60)) / 1000)
  const isUrgent = hours < 1

  return {
    hours,
    minutes,
    seconds,
    totalMs,
    isExpired: false,
    isUrgent,
  }
}

/**
 * Format time remaining as human-readable string
 */
export function formatTimeRemaining(timeRemaining: TimeRemaining | null): string {
  if (!timeRemaining || timeRemaining.isExpired) {
    return 'Expired'
  }

  const { hours, minutes } = timeRemaining

  if (hours >= 1) {
    return `${hours}h ${minutes}m`
  } else if (minutes > 0) {
    return `${minutes}m`
  } else {
    return 'Expiring soon'
  }
}

/**
 * Format time remaining for full viewer display
 */
export function formatTimeRemainingLong(timeRemaining: TimeRemaining | null): string {
  if (!timeRemaining || timeRemaining.isExpired) {
    return 'This media has expired'
  }

  const { hours, minutes } = timeRemaining

  if (hours >= 1) {
    return `Expires in ${hours}h ${minutes}m`
  } else if (minutes > 0) {
    return `Expires in ${minutes}m`
  } else {
    return 'Expiring in less than a minute'
  }
}

/**
 * Get percentage of time remaining (for circular progress)
 */
export function getTimePercentage(expiryAt: string | null): number {
  if (!expiryAt) return 0

  const now = new Date().getTime()
  const expiry = new Date(expiryAt).getTime()
  const created = expiry - (24 * 60 * 60 * 1000) // 24 hours before expiry
  
  const total = expiry - created
  const elapsed = now - created
  const remaining = total - elapsed

  if (remaining <= 0) return 0
  if (remaining >= total) return 100

  return (remaining / total) * 100
}

/**
 * Check if media should show "first time" label
 * Shows "Expires in 24 hours" label only on recently sent media
 */
export function shouldShowFirstTimeLabel(expiryAt: string | null): boolean {
  if (!expiryAt) return false

  const now = new Date().getTime()
  const expiry = new Date(expiryAt).getTime()
  const created = expiry - (24 * 60 * 60 * 1000)
  const timeSinceCreation = now - created

  // Show label if media was created less than 5 minutes ago
  return timeSinceCreation < (5 * 60 * 1000)
}

