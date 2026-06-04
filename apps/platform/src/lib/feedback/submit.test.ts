import { describe, expect, test, vi } from 'vitest';
import {
  feedbackAck,
  feedbackEndpoint,
  submitAppFeedback,
  MAX_FEEDBACK_LEN,
} from './submit';

function jsonResponse(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  return {
    status,
    ok: init.ok ?? (status >= 200 && status < 300),
    json: async () => body,
  } as unknown as Response;
}

describe('feedbackEndpoint', () => {
  test('targets the wrapper endpoint with an encoded slug', () => {
    expect(feedbackEndpoint('my-app')).toBe('/__shippie/feedback?slug=my-app');
    expect(feedbackEndpoint('weird/slug ?')).toBe('/__shippie/feedback?slug=weird%2Fslug%20%3F');
  });
});

describe('feedbackAck — soft acknowledgement', () => {
  test('open is visible-now', () => {
    expect(feedbackAck('open')).toMatch(/maker/i);
  });
  test('reviewing and spam read identically (never expose the verdict)', () => {
    expect(feedbackAck('reviewing')).toBe(feedbackAck('spam'));
    expect(feedbackAck('spam')).not.toMatch(/spam/i);
  });
});

describe('submitAppFeedback', () => {
  test('rejects an empty message before any fetch', async () => {
    const fetchImpl = vi.fn();
    const r = await submitAppFeedback({ slug: 'a', type: 'idea', message: '   ', fetchImpl });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/note/i) });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('rejects a missing slug', async () => {
    const r = await submitAppFeedback({ slug: '', type: 'bug', message: 'hi', fetchImpl: vi.fn() });
    expect(r.ok).toBe(false);
  });

  test('posts type + body to the slug endpoint and returns status', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, id: 'fb_1', status: 'open' }));
    const r = await submitAppFeedback({ slug: 'wedding-demo', type: 'bug', message: '  export is broken  ', fetchImpl });
    expect(r).toEqual({ ok: true, status: 'open', id: 'fb_1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/__shippie/feedback?slug=wedding-demo',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'bug', body: 'export is broken' }),
      }),
    );
  });

  test('truncates an over-long message to the max length', async () => {
    let sentBody = '';
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body)).body;
      return jsonResponse({ ok: true, id: 'x', status: 'reviewing' });
    });
    await submitAppFeedback({ slug: 'a', type: 'other', message: 'z'.repeat(MAX_FEEDBACK_LEN + 50), fetchImpl });
    expect(sentBody.length).toBe(MAX_FEEDBACK_LEN);
  });

  test('maps 429 to a rate-limit message', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'rate_limited' }, { status: 429 }));
    const r = await submitAppFeedback({ slug: 'a', type: 'idea', message: 'hi', fetchImpl });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/minute/i) });
  });

  test('maps a network failure to a friendly error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    const r = await submitAppFeedback({ slug: 'a', type: 'idea', message: 'hi', fetchImpl });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/connection/i) });
  });

  test('treats a non-ok / malformed response as an error', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: false }, { status: 500 }));
    const r = await submitAppFeedback({ slug: 'a', type: 'idea', message: 'hi', fetchImpl });
    expect(r.ok).toBe(false);
  });

  test('normalises an unexpected status to reviewing', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, id: 'x', status: 'weird' }));
    const r = await submitAppFeedback({ slug: 'a', type: 'idea', message: 'hi', fetchImpl });
    expect(r).toEqual({ ok: true, status: 'reviewing', id: 'x' });
  });
});
