# Jet Note UI Language

`English.json` defines the complete language-key structure. `Chinese.json` mirrors
that structure for Chinese UI wording.

- Android and WebView select Chinese for every `zh-*` phone locale (Simplified
  or Traditional Chinese); all other locales use English.
- A manual choice from Settings -> Language is persisted natively and takes
  priority over the phone locale until the user switches it again.
- If the Chinese catalog cannot be loaded, WebView falls back to English.

- Web UI reads it through `shared/core/language_catalog.js`.
- Legacy `language.js` and `ui_language.js` are compatibility facades only; they must not fetch or own a second language cache.
- Native Android UI reads the selected catalog through `UiLanguage.java`, which caches the parsed JSON once per app process.
- New visible labels, status messages, accessibility labels, dialogs, download/export feedback, and error recovery instructions belong here rather than in Java/JS/HTML.
- `config.json` remains for behavior, colors, geometry, limits, paths and other non-language configuration.
