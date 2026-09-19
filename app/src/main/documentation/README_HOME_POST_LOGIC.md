# Home Post Logic — Jet Note language map

This document describes ownership and naming. It does not redefine product behavior.

## Three Posts, One Body

`Top Post` — contains the current `Super Star Post` only. There is no Welcome Post fallback.

`Post Composer` — owns creation/edit entry UI. Star/Super Star movement must not rebuild the Post Composer merely to reorder Posts.

`Main Posts` — owns the ordinary published Post list.

## Post action chain

The horizontal ellipsis opens the `Horizontal Ellipsis Menu Family`. Star and Super Star actions change Post state, persist the state, render the affected Post surfaces, then use `Post Movement` to preserve visual continuity.

`Post Movement` is the product/code term. FLIP is only the current implementation technique inside Post Movement.

## Ownership boundaries

- **Post Movement** owns Post geometry snapshots, Post transforms, and movement timing.
- **Horizontal Ellipsis Menu Family** follows the active Post. It does not move the Post or the viewport.
- **Post Composer** is independent from Star/Super Star reordering and should remain mounted unless composer behavior itself requires a rebuild.
- **Star / Super Star transaction** owns state mutation, persistence, sound/highlight side effects, and invokes rendering/movement in their existing order.

## Refactor rule

A cleanup is behavior-preserving by default. Do not delete a call because it looks redundant. Before removing a call, prove that it has no event, persistence, DOM, native bridge, media hydration, sound, menu, timing, or configuration side effect.
