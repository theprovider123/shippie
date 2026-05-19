import { describe, expect, test } from 'vitest';
import {
  connectionBadgesFromConnections,
  connectionBadgesFromKind,
  connectionsFromGuard,
} from './connection-badges';

describe('connection disclosure badges', () => {
  test('stays quiet for local/default apps', () => {
    expect(connectionBadgesFromKind('local')).toEqual([]);
    expect(connectionBadgesFromKind(null)).toEqual([]);
    expect(connectionBadgesFromConnections([])).toEqual([]);
  });

  test('labels connected and cloud apps only when something extra happens', () => {
    expect(connectionBadgesFromKind('connected')[0]?.label).toBe('Uses external services');
    expect(connectionBadgesFromKind('cloud')[0]?.label).toBe('Creator-hosted service');
  });

  test('prioritises specific service labels from Connection Guard metadata', () => {
    expect(
      connectionBadgesFromConnections([
        { host: 'api.openai.com', category: 'external-ai', purpose: 'External AI processing' },
      ])[0]?.label,
    ).toBe('Uses AI service');
    expect(
      connectionBadgesFromConnections([
        { host: 'api.openweathermap.org', category: 'feature', purpose: 'Weather forecast' },
      ])[0]?.label,
    ).toBe('Uses weather service');
  });

  test('normalises unknown guard payloads safely', () => {
    const connections = connectionsFromGuard({
      connections: [
        { host: 'api.stripe.com', category: 'feature', purpose: 'Payment checkout', data: ['user_data'] },
        { host: 123 },
        null,
      ],
    });
    expect(connections).toHaveLength(1);
    expect(connectionBadgesFromConnections(connections)[0]?.label).toBe('Uses payment provider');
  });
});
