import { describe, it, expect } from 'vitest';
import { compareVersions } from './pluginVersions';

describe('compareVersions', () => {
  it('compares numeric cores segment by segment', () => {
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('a release beats any of its own prereleases', () => {
    expect(compareVersions('1.0.0', '1.0.0-beta1')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-beta1', '1.0.0')).toBeLessThan(0);
  });

  it('orders same-core prerelease suffixes lexicographically', () => {
    expect(compareVersions('1.0.0-beta2', '1.0.0-beta1')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-alpha1', '1.0.0-beta1')).toBeLessThan(0);
  });

  it('treats a missing/non-numeric segment as 0', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.x.0', '1.0.0')).toBe(0);
  });
});
