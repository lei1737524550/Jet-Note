# Editor decoupling V36

- `app/post_editor/*` owns only the normal Post Editor lifecycle, geometry, keyboard policy and tools.
- `app/debug_post/*` owns the Edit Debug Post shell, configuration loading, focus policy, search overlay and bottom safe-area geometry.
- Debug HTML no longer inherits `.post-compose-screen`, `.post-compose-body`, `.post-input-row`, `.post-compose-title` or `.post-compose-publish`.
- `editor_config.js` no longer writes Debug Editor CSS variables. Debug configuration is loaded by `debug_post.js`.
- Tool DOM is preloaded once. Expansion changes `is_display` and grid-slot ownership; it does not insert/remove tool nodes.
- All editor buttons are pointer-focus-neutral. Only first editor entry and explicit text input/textarea interaction can request focus/IME.
