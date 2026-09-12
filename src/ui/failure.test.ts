import { describe, expect, it } from 'vitest';
import { describeFailure } from './failure';
import { MissingApiKeyError } from '@/services/rounds/roundService';

describe('describeFailure', () => {
  // Each browser words a missing chunk differently, and none of them say what
  // it means. All three have to land on the same advice.
  it.each([
    ['Safari', 'Importing a module script failed.'],
    ['Chrome', 'Failed to fetch dynamically imported module: https://x/assets/web-AbC123.js'],
    ['Firefox', 'error loading dynamically imported module'],
  ])('recognises a stale build from %s', (_browser, message) => {
    const failure = describeFailure(new Error(message));

    expect(failure.reloadWillHelp).toBe(true);
    expect(failure.message).toMatch(/updated while this page was open/);
    expect(failure.settingsWillHelp).toBe(false);
  });

  it('keeps the browser wording as detail rather than as the headline', () => {
    const failure = describeFailure(new Error('Importing a module script failed.'));

    expect(failure.detail).toBe('Importing a module script failed.');
  });

  // The stale-build check runs first, so it must not swallow anything else.
  it('still points a missing key at Settings, not at a reload', () => {
    const failure = describeFailure(new MissingApiKeyError());

    expect(failure.settingsWillHelp).toBe(true);
    expect(failure.reloadWillHelp).toBeFalsy();
  });

  it('does not mistake an ordinary module-shaped message for a stale build', () => {
    const failure = describeFailure(new Error('Could not import the vocabulary dump.'));

    expect(failure.reloadWillHelp).toBeFalsy();
  });

  it('survives a thrown non-Error', () => {
    expect(describeFailure('Importing a module script failed.').reloadWillHelp).toBe(true);
    expect(describeFailure(null).message).toBeTruthy();
  });
});
