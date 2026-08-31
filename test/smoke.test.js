// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../xenforo-story-reader.user.js', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const meta = src.slice(0, src.indexOf('==/UserScript=='));

describe('userscript smoke', () => {
  it('has a complete metadata block', () => {
    expect(src).toContain('// ==UserScript==');
    expect(src).toContain('// ==/UserScript==');
    for (const key of ['@name', '@version', '@description', '@match', '@grant', '@downloadURL', '@updateURL'])
      expect(meta).toContain(key);
  });

  it('@version is semver and matches package.json', () => {
    const v = meta.match(/@version\s+(\S+)/)[1];
    expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    expect(v).toBe(pkg.version);
  });

  it('matches all supported forums', () => {
    for (const host of [
      'forum.questionablequesting.com',
      'questionablequesting.com',
      'forums.spacebattles.com',
      'forums.sufficientvelocity.com',
    ])
      expect(meta).toContain(`https://${host}/threads/*`);
  });

  it('auto-update URLs point at the raw file on main', () => {
    const raw = 'https://raw.githubusercontent.com/elfensky/xenforo-story-reader/main/xenforo-story-reader.user.js';
    expect(meta.match(/@downloadURL\s+(\S+)/)[1]).toBe(raw);
    expect(meta.match(/@updateURL\s+(\S+)/)[1]).toBe(raw);
  });

  it('compiles as a single script', () => {
    expect(() => new Function(src)).not.toThrow();
  });

  it('stays a lean single file', () => {
    expect(src.length).toBeLessThan(40_000);
  });
});
