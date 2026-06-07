export interface Branding { displayName: string; primaryColor?: string; logoUrl?: string; }
export interface PrivateAppInstance {
  id: string;            // IMMUTABLE instance identity (UUID). The DO derives from `uniti:${id}` — NEVER from slug.
  appId: string;         // 'uniti' (logical app key)
  appRef: string;        // Shippie apps.id row this instance belongs to (the private Uniti app)
  spaceId: string;       // Shippie space (install record) representing this school
  slug: string;          // mutable, human-friendly alias (UNIQUE) — must NOT be the data-boundary identity
  name: string; region: string;
  branding: Branding; ownerEmail: string; modules: string[];
  workspaceDoId: string; createdAt: string;
}
export interface ExportManifest { instanceId: string; files: string[]; generatedAt: string; }
export interface CreatePrivateAppInstanceInput {
  appId: string; tenantName: string; slug: string; branding: Branding;
  ownerEmail: string; region: string; modules: string[];
  dataBoundary: 'dedicated-school-workspace';
}
export interface PrivateAppProvisioning {
  createPrivateAppInstance(input: CreatePrivateAppInstanceInput): Promise<PrivateAppInstance>;
  getInstance(instanceId: string): Promise<PrivateAppInstance | null>;
  deprovision(instanceId: string, mode: 'export' | 'erase'): Promise<ExportManifest>;
}
