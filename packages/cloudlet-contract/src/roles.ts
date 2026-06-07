export const ROLES = [
  'owner','school_admin','office_manager','leader',
  'teacher','teaching_assistant','specialist','viewer',
] as const;
export type Role = (typeof ROLES)[number];
