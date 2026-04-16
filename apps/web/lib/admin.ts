/**
 * Admin gate — checks if a user email is in the ADMIN_EMAILS allow list.
 *
 * MVP: comma-separated env var. Production: role-based via DB.
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed =
    process.env.ADMIN_EMAILS?.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean) ?? [];
  return allowed.includes(email.toLowerCase());
}
