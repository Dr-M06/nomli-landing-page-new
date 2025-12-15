/**
 * Referral Code Generation and Validation
 * 
 * Generates unique referral codes for influencers
 * Format: NOMLI-XXXXXX (where X is alphanumeric)
 */

const PREFIX = "NOMLI"
const CODE_LENGTH = 6
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // Removed confusing chars (0, O, I, 1)

/**
 * Generate a unique referral code
 * Format: NOMLI-XXXXXX
 */
export function generateReferralCode(): string {
  let code = ""
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length))
  }
  return `${PREFIX}-${code}`
}

/**
 * Validate referral code format
 */
export function isValidReferralCode(code: string): boolean {
  const pattern = /^NOMLI-[A-Z2-9]{6}$/
  return pattern.test(code.toUpperCase())
}

/**
 * Normalize referral code (uppercase, remove spaces)
 */
export function normalizeReferralCode(code: string): string {
  if (!code) return ""
  return code.toUpperCase().replace(/\s+/g, "").trim()
}

/**
 * Extract referral code from URL
 * Supports formats:
 * - /invite/CODE
 * - /invite?ref=CODE
 * - /signup?ref=CODE
 */
export function extractReferralCodeFromUrl(url: string): string | null {
  // Try path parameter first: /invite/CODE
  const pathMatch = url.match(/\/invite\/([A-Z0-9-]+)/i)
  if (pathMatch) {
    return normalizeReferralCode(pathMatch[1])
  }

  // Try query parameter: ?ref=CODE
  const urlObj = new URL(url, "http://dummy.com")
  const refParam = urlObj.searchParams.get("ref")
  if (refParam) {
    return normalizeReferralCode(refParam)
  }

  return null
}

