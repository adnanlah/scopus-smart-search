import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('treats blank optional environment values as unset', () => {
    const config = loadConfig({ SCOPUS_API_KEY: '', SCOPUS_INST_TOKEN: '' });
    expect(config.apiKey).toBeUndefined();
    expect(config.institutionToken).toBeUndefined();
  });
});