# Jet Note frontend structure

The Android WebView entry point is `app/home/home.html`.

## Directory rules

- `app/` — feature-specific UI and logic.
- `shared/` — code reused by multiple pages/features.
- `config.json` — user-tunable runtime configuration.
- `language/` — language data.

## Post editor

- `app/post_editor/editor_config.js` — maps `config.json` values to CSS variables.
- `app/post_editor/draft_store.js` — in-memory draft model only.
- `app/post_editor/composer_caret.js` — native caret compatibility bridge; WebView owns caret positioning.
- `app/post_editor/editor_controller.js` — editor lifecycle and persistence coordinator.
- `app/post_editor/tools.js` — horizontal post-editor tool rendering/actions.
- `shared/core/viewport.js` — the only owner of viewport/IME geometry.

### Important rule

Do not calculate keyboard or viewport height inside feature files. Consume the CSS variables and `jetnote:viewport-change` event produced by `shared/core/viewport.js`.

## Post editor tool-row geometry

The New/Edit Post tools are laid out as one horizontal row **below** the text area.
The tool order is still owned by the existing tool configuration; layout CSS must
not hard-code a particular tool count.

Current geometry:

- phone reference width: `1080 / 2.65 ≈ 407.5 CSS px`
- `.post-compose-body` horizontal padding: `20px + 20px`
- actual toolbar inner width on that reference phone: `407.5 - 40 ≈ 367.5px`
- each tool button: `48px × 48px`
- each SVG icon: `24px × 24px`
- button internal padding: `10px`
- horizontal gap between buttons: `8px`
- text-area-to-toolbar vertical gap: `12px`

Width formula for `n` tools:

`tool_row_width = n × 48 + (n - 1) × 8`

Reference results:

- 4 tools: `4×48 + 3×8 = 216px`
- 5 tools: `5×48 + 4×8 = 272px`
- 6 tools: `6×48 + 5×8 = 328px`
- 7 tools: `7×48 + 6×8 = 384px`
- 8 tools: `8×48 + 7×8 = 440px`

For the reference device, **6 tools is the recommended comfortable maximum in a
single non-scrolling row**. With the actual `≈367.5px` inner width, six tools use
`328px`, leaving about `39.5px`, or roughly `19.75px` breathing room on each side
when centered. Seven tools need `384px`, which is wider than the padded content
area, so the toolbar intentionally supports horizontal scrolling rather than
shrinking the 48px touch targets.

Design rule: keep the 48px button and 24px icon sizes stable. Prefer six visible
tools per row on this device class; if more tools are enabled, preserve the same
sizes and allow horizontal scrolling instead of compressing the controls.


## Post editor Tool / Toolbox contract

The canonical model now lives in `app/post_editor/tools/tools.json` and uses a nested Toolbox node:

```text
tools
├── tool_1       AddVideoButton
├── tool_2       AddImageButton
├── tool_3       AddAudioButton
└── tool_m1      ToolboxButton
    ├── toolbox_1 DictionaryButton
    ├── toolbox_2 SentencesButton
    ├── toolbox_3 GoogleButton
    └── toolbox_N ...
```

`tool_m1` is the special left-expansion anchor. Opening it replaces slots to its left with `toolbox_N` children; it does not append children to the right and does not mutate the original `tools[]`. `config.json -> new_post_tools.maximum_visible_tools` defines the maximum visible capacity (currently 6).

All URL-based `toolbox_N` entries reuse `ToolPageController` and the modular `assets/get_source/` project; do not create per-site WebView/source-capture implementations.


## Get Source resource project

`assets/get_source/` owns page-resource capture. `get_source.js` is the shared observer/UI core; `get_text.js`, `get_audio.js`, `get_image.js`, and `get_video.js` own type-specific matching/rendering. `get_source/config.json` stores extension filters and priority order so the root app config does not become overloaded. The result header is split 1:1: close control on the left half and four equal Text/Audio/Image/Video controls on the right half. Matching resources sort first in green; other captured candidates follow in red. Images and videos reuse the existing `app/media/image_viewer.js` viewer.

## Home Post behavior

Home Post naming/ownership follows `README_HOME_POST_LOGIC.md` and `language/jet_note_ui_language.json`. Product terms take precedence over generic browser implementation names.
