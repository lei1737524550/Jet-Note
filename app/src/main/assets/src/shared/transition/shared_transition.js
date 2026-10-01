'use strict';

/**
 * One transition engine for Editor + Settings, in both directions.
 *
 * SharedTransition.run({ page, phase, screen, header, body, prepare, finish, durationMs })
 *   page  : 'editor' | 'settings'   -> selects the page motion profile
 *   phase : 'enter'  | 'exit'       -> plays that profile forward/reverse
 *
 * Editor body:   enter left -> rest, exit rest -> left.
 * Settings body: enter right -> rest, exit rest -> right.
 * Header:        enter top -> rest,  exit rest -> top.
 *
 * The home page stays underneath. On exit the overlay is hidden only after the
 * reverse animation completes, so the last animated frame naturally reveals Home.
 */
window.SharedTransition = (() => {
  const active = new WeakMap();
  const Page = Object.freeze({ EDITOR: 'editor', SETTINGS: 'settings' });
  const Phase = Object.freeze({ ENTER: 'enter', EXIT: 'exit' });

  async function duration(override) {
    let value = override;
    if (value == null) {
      try {
        const response = await fetch('config.json', { cache: 'no-store' });
        if (response.ok) value = (await response.json()).shared_transition?.duration_ms;
      } catch (_) {}
    }
    const number = Number(value ?? 320);
    return Number.isFinite(number) ? Math.max(0, Math.min(5000, number)) : 320;
  }

  function cancel(screen) {
    if (screen) active.get(screen)?.cancel();
  }

  async function run({ page, phase, screen, header, body, prepare, finish, durationMs }) {
    if (!Object.values(Page).includes(page)) throw new Error('SharedTransition: invalid page');
    if (!Object.values(Phase).includes(phase)) throw new Error('SharedTransition: invalid phase');
    if (!screen || !header || !body || !screen.contains(header) || !screen.contains(body)) {
      throw new Error('SharedTransition requires a screen, its header and its complete body');
    }

    cancel(screen);
    const animations = [];
    const previous = {
      inert: screen.inert,
      headerVisibility: header.style.visibility,
      bodyVisibility: body.style.visibility
    };
    let cancelled = false;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      animations.forEach(animation => animation.cancel());
      header.style.visibility = previous.headerVisibility;
      body.style.visibility = previous.bodyVisibility;
      screen.inert = previous.inert;
      screen.classList.remove('shared-transition-reveal-home');
      if (active.get(screen) === transaction) active.delete(screen);
    };
    const transaction = { cancel: () => { cancelled = true; cleanup(); } };
    active.set(screen, transaction);

    try {
      const milliseconds = await duration(durationMs);
      if (cancelled) return false;

      screen.inert = true;
      // The full-screen route itself normally has an opaque background. During
      // EXIT that background must become transparent; otherwise moving only the
      // header/body merely exposes the route's own blank background instead of Home.
      if (phase === Phase.EXIT) screen.classList.add('shared-transition-reveal-home');
      if (phase === Phase.ENTER) header.style.visibility = body.style.visibility = 'hidden';
      await prepare?.();
      if (cancelled) return false;

      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (milliseconds > 0 && !reducedMotion && header.animate && body.animate) {
        const screenRect = screen.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const bodyRect = body.getBoundingClientRect();
        const topOffset = -(headerRect.bottom - screenRect.top);
        const sideOffset = page === Page.SETTINGS
          ? screenRect.right - bodyRect.left
          : screenRect.left - bodyRect.right;
        const rest = 'translate3d(0,0,0)';
        const headerAway = `translate3d(0,${topOffset}px,0)`;
        const bodyAway = `translate3d(${sideOffset}px,0,0)`;
        const options = { duration: milliseconds, easing: 'cubic-bezier(.22,.72,.22,1)', fill: 'both' };
        const entering = phase === Phase.ENTER;

        animations.push(header.animate(entering
          ? [{ transform: headerAway }, { transform: rest }]
          : [{ transform: rest }, { transform: headerAway }], options));
        animations.push(body.animate(entering
          ? [{ transform: bodyAway }, { transform: rest }]
          : [{ transform: rest }, { transform: bodyAway }], options));
      }

      header.style.visibility = previous.headerVisibility;
      body.style.visibility = previous.bodyVisibility;
      await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
      if (cancelled) return false;
      await finish?.();
      return true;
    } finally {
      cleanup();
    }
  }

  return Object.freeze({ run, cancel, Page, Phase });
})();
