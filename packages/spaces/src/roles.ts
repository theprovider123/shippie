import type { SpaceRoleDeclaration } from './types.ts';

export function normaliseRole(role: string | null | undefined, declarations: readonly SpaceRoleDeclaration[] = []): string | null {
  if (!role) return null;
  if (declarations.length === 0) return safeRoleId(role);
  const safe = safeRoleId(role);
  return declarations.some((decl) => decl.id === safe) ? safe : null;
}

export function rolePermissions(role: string, declarations: readonly SpaceRoleDeclaration[] = []): string[] {
  return declarations.find((decl) => decl.id === role)?.permissions?.slice() ?? [];
}

export function canRole(role: string, permission: string, declarations: readonly SpaceRoleDeclaration[] = []): boolean {
  return rolePermissions(role, declarations).includes(permission);
}

function safeRoleId(role: string): string | null {
  const trimmed = role.trim();
  return /^[a-z][a-z0-9_-]{0,63}$/.test(trimmed) ? trimmed : null;
}

