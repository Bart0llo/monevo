import { describe, expect, it } from 'vitest';
import { isLanguage, resolveLanguage, resources } from './index.js';

describe('resolveLanguage', () => {
  it('matches the primary subtag', () => {
    expect(resolveLanguage(['pl-PL', 'en-US'])).toBe('pl');
    expect(resolveLanguage(['en-GB'])).toBe('en');
  });

  it('skips unsupported languages', () => {
    expect(resolveLanguage(['de-DE', 'PL'])).toBe('pl');
  });

  it('falls back to English', () => {
    expect(resolveLanguage([])).toBe('en');
    expect(resolveLanguage(['fr'])).toBe('en');
  });
});

describe('resources', () => {
  it('ships every namespace for every language', () => {
    for (const lang of Object.keys(resources)) {
      expect(isLanguage(lang)).toBe(true);
    }
    expect(Object.keys(resources.pl)).toEqual(Object.keys(resources.en));
  });
});
