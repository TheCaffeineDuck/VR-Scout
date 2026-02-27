/**
 * Simple admin check for standalone development.
 * In production, this checks a Firestore 'admins' collection or custom claims.
 */

const ADMIN_EMAILS: string[] = [
  // Add your email(s) here for development
  // In production, replace with Firestore lookup
]

export function isAdmin(email: string | null): boolean {
  if (import.meta.env.DEV) return true // Everyone is admin in dev
  if (!email) return false
  return ADMIN_EMAILS.includes(email)
}
