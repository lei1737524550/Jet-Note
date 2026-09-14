# Jet Note UI Language

`english.json` is the single source of truth for user-visible English wording.

- Web UI reads it through `shared/core/language_catalog.js`.
- Legacy `language.js` and `ui_language.js` are compatibility facades only; they must not fetch or own a second language cache.
- Native Android UI reads it through `UiLanguage.java`, which caches the parsed JSON once.
- New visible labels, status messages, accessibility labels, dialogs, download/export feedback, and error recovery instructions belong here rather than in Java/JS/HTML.
- `config.json` remains for behavior, colors, geometry, limits, paths and other non-language configuration.
