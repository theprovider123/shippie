export interface WorkspaceEvent {
  clientEventId: string;   // server dedupes on (instanceId, clientEventId)
  type: string;            // e.g. 'feedback.created'
  instanceId: string;      // which school instance
  actorUserId: string;
  deviceId: string;
  createdOfflineAt: string;// ISO, client clock
  schemaVersion: number;
  payload: unknown;
}
