# Post Movement implementation archive

This document contains implementation explanations. The short normative rule
remains near the front of `assets/language/jet_note_ui_language.json`.

## Bottom-up fixed suffix

Before a Star state change, capture the finite identity sequence. After the
state change, construct the new sequence. Compare both sequences from their
last item upward. Continue while the IDs are equal and stop at the first
mismatch. Every matched ID belongs to the fixed suffix.

The fixed suffix is excluded before geometry is read for FLIP preparation. Its
members receive no transform, transition, movement layer, shared duration, or
derived speed. Geometry determines only the displacement of identities already
inside the changing prefix. A temporary DOM measurement difference must never
override the identity decision.

Example:

```text
before: A B C D E
after:  B A C D E
bottom-up matches: E, D, C
fixed suffix: C D E
movement participants: A B
```

Published text hydration is completed synchronously during the LAST write of a
Post Movement transaction. This ensures the eight-line folded height is stable
before LAST rectangles are measured. A generation token invalidates older
font-ready callbacks so they cannot change card heights during PLAY.

## Published Post text drawer

The collapsed body contains at most eight editor-compatible visual lines. The
drawer uses the configured duration, default 300 ms, and
`cubic-bezier(.22,.72,.22,1)`.

Expansion records the current pixel height, restores `dataset.fullText`, reads
the full `scrollHeight`, then transitions between those heights with
`overflow:hidden`. Collapse transitions from the full height to eight line
boxes. Only after collapse finishes does the renderer restore the eighth-line
character fade and hide the remaining text. Temporary height, transition, and
overflow styles are cleared after completion. Repeated clicks are ignored while
`drawer.dataset.animating` is true, and the custom scrollbar is refreshed at
the end.

## Acted-on Post movement layer

During same-surface movement, the acted-on real Post temporarily uses
`z-index:2001`. During Top/Main crossing, document-coordinate paint proxies use
layer 2000 and the acted-on proxy uses 2001. This keeps the selected Post above
other Posts for the full INVERT and PLAY interval while menus remain on their
higher interaction layer. Cleanup removes proxies and restores every saved
real-node z-index.

Cross-surface proxies use `position:absolute`. Their origin is
`FIRST rect + current scroll`, and their destination is
`LAST rect + current scroll`. Both values are document coordinates. The proxy
therefore scrolls naturally with the page exactly like its hidden real Post.
`position:fixed`, stored viewport destinations, and per-frame camera correction
are forbidden in this path.

## User-owned camera

The camera is `window.scrollX/window.scrollY` and belongs exclusively to the
user. Star, Cancel Star, Super Star, and Cancel Super Star never capture a
camera destination and never restore or correct it. Users may scroll freely
during PLAY; the position they reach remains authoritative after cleanup.

HTML/body scroll anchoring is disabled only around the synchronous LAST DOM
rebuild to prevent the browser from manufacturing an automatic jump. It does
not block manual scrolling. Post Movement does not call `fit()`, `scrollTo()`,
`scrollBy()`, `scrollIntoView()`, automatic centering, or any equivalent camera
write. Menu following and visual-settle checks may read screen-space Post
rectangles but camera coordinates are not part of their completion criteria.
