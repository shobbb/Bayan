import { flushSync } from 'react-dom';

/**
 * Screen changes as a cross-fade (§5.7).
 *
 * The suddenness is not a missing animation so much as a missing *outgoing*
 * one: React swaps the tree in a single commit, so the old screen is gone in
 * the same frame the new one appears. A mount animation cannot fix that — by
 * the time it runs there is nothing left to fade out of, and the result is the
 * new screen fading in over a blank page, which reads as a flash rather than a
 * change.
 *
 * The View Transitions API is what closes it: the browser snapshots the page
 * before the update, takes a second snapshot after, and cross-fades the two as
 * images. That gives a real dissolve across a React commit that has no notion
 * of "before".
 *
 * `flushSync` is required rather than incidental. The browser snapshots as soon
 * as the callback returns, so the DOM has to be updated synchronously inside
 * it; a normal `setState` would still be queued at that point and the browser
 * would photograph the old screen twice.
 */

interface ViewTransition {
  finished: Promise<void>;
}

type TransitionalDocument = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition;
};

function supportsViewTransitions(): boolean {
  return typeof (document as TransitionalDocument).startViewTransition === 'function';
}

/**
 * REQ-D8: all motion becomes instant. Checked here as well as in CSS because
 * skipping the whole mechanism is cheaper and more certain than animating to a
 * zero duration — a view transition with no animation still blocks the frame.
 */
function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Marks the document so the stylesheet can fall back to a plain fade-in on the
 * incoming screen where the API is missing. Not as good — there is still no
 * outgoing half — but better than an instant swap, and it costs one class.
 */
export function markTransitionSupport(): void {
  if (!supportsViewTransitions()) {
    document.documentElement.classList.add('no-view-transitions');
  }
}

/**
 * Applies a screen change, cross-faded where the platform allows it.
 *
 * Used only for changes that are actually a change of screen. Re-rendering the
 * screen already on display — an article re-segmented after its words are
 * translated, say — must not go through here: there is nothing to cross-fade
 * to, and dissolving a page into a near-identical copy of itself reads as a
 * glitch.
 */
export function navigate(update: () => void): void {
  const doc = document as TransitionalDocument;

  if (!doc.startViewTransition || prefersReducedMotion()) {
    update();
    return;
  }

  const transition = doc.startViewTransition(() => {
    flushSync(update);
  });

  // A transition is skipped if another starts first, which rejects `finished`.
  // That is a navigation racing a navigation, not a fault worth surfacing.
  void transition.finished.catch(() => undefined);
}
