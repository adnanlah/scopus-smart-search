import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('treats blank optional environment values as unset', () => {
    const config = loadConfig({ OPENALEX_API_KEY: '' });
    expect(config.apiKey).toBeUndefined();
    expect(config.baseUrl).toBe('https://api.openalex.org');
  });
});
