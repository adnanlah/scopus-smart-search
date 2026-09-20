import { describe, expect, it, vi } from 'vitest';
import { OpenAlexClient } from './index.js';

describe('OpenAlexClient inferred filters', () => {
  it('serializes a composed filter alongside the base core filter', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ meta: { count: 0 }, results: [] }), { status: 200 }),
    );

    await new OpenAlexClient({ baseUrl: 'https://example.test' }).search('computer science methods', {
      filter: 'topics.field.id:17|28,topics.domain.id:3',
    });

    const [input] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(input)).searchParams.get('filter')).toBe(
      'primary_location.source.is_core:true,topics.field.id:17|28,topics.domain.id:3',
    );
    fetchMock.mockRestore();
  });
});
