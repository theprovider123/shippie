import { describe, it, expect } from 'vitest';
import { classifyComplianceRows } from './compliance-view';
import type { AuditLogEntry } from '$server/db/schema/audit-log';

const row = (over: Partial<AuditLogEntry> & { action: string }): AuditLogEntry =>
  ({
    id: over.id ?? crypto.randomUUID(),
    organizationId: null,
    actorUserId: over.actorUserId ?? 'u1',
    action: over.action,
    targetType: 'instance:inst_1',
    targetId: null,
    metadata: over.metadata ?? null,
    ipHash: null,
    createdAt: over.createdAt ?? '2026-06-07T10:00:00Z',
  }) as AuditLogEntry;

describe('classifyComplianceRows', () => {
  it('classifies an AI request with model/cached/sensitivity/safeguarding', () => {
    const v = classifyComplianceRows([
      row({
        action: 'ai.request',
        metadata: {
          after: {
            purpose: 'adaptation.generate',
            model: '@cf/meta/llama-3.1-8b-instruct',
            cached: false,
            tokens: 120,
            sensitivity: 'pseudonymised',
            safeguardingExcluded: 2,
          },
        },
      }),
    ]);
    expect(v.ai).toHaveLength(1);
    expect(v.ai[0]).toMatchObject({
      purpose: 'adaptation.generate',
      model: '@cf/meta/llama-3.1-8b-instruct',
      cached: false,
      tokens: 120,
      sensitivity: 'pseudonymised',
      safeguardingExcluded: 2,
      refused: false,
    });
  });

  it('marks an AI refusal with its reason', () => {
    const v = classifyComplianceRows([
      row({ action: 'ai.refused', metadata: { after: { purpose: 'x.y', reason: 'ai_disabled' } } }),
    ]);
    expect(v.ai[0].refused).toBe(true);
    expect(v.ai[0].reason).toBe('ai_disabled');
  });

  it('separates break-glass access from data events', () => {
    const v = classifyComplianceRows([
      row({ action: 'breakglass.access', metadata: { after: { reason: 'support ticket' } } }),
      row({ action: 'private_app_instance.erased', metadata: { after: { mode: 'erase' } } }),
      row({ action: 'pupil.erased' }),
      row({ action: 'retention.applied' }),
      row({ action: 'usage.metered' }), // ignored — not a compliance view
    ]);
    expect(v.breakGlass).toHaveLength(1);
    expect(v.breakGlass[0].action).toBe('breakglass.access');
    expect(v.dataEvents.map((d) => d.action).sort()).toEqual([
      'private_app_instance.erased',
      'pupil.erased',
      'retention.applied',
    ]);
  });
});
