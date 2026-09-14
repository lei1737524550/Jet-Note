# Modular UI / language refactor

This revision establishes two single-source rules:

1. **User-visible wording:** `assets/language/english.json`.
2. **Language access:** `shared/core/language_catalog.js` for WebView code and `UiLanguage.java` for native Android code.

Compatibility wrappers (`language.js`, `ui_language.js`) delegate to the shared catalog and do not own independent fetch/cache logic. Tool/Get Source pages receive the same English JSON and the same language catalog before shared viewer code is injected.

New modules should not embed visible English labels/status/dialog copy in Java, JavaScript, or HTML. Internal protocol tokens, MIME values, HTTP method names, developer diagnostics, and exception identifiers are not UI language and remain in code.
