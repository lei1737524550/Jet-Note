# Post Editor Tools / Toolbox

This directory defines the New/Edit Post primary tools and the tools revealed by the toolbox.

## Naming

```text
tools
├── tool_1          name = AddVideoButton
├── tool_2          name = AddImageButton
├── tool_3          name = AddAudioButton
└── tool_4          name = ToolboxButton
    └── toolbox
        ├── toolbox_tool_1   name = DictionaryButton
        ├── toolbox_tool_2   name = SentencesButton
        └── toolbox_tool_N   name = ...
```

- `tool_N`: stable runtime ID for a primary tool.
- `toolbox_tool_N`: stable runtime ID for a toolbox tool.
- `name`: maintainer-only description. Runtime code must never use `name` for dispatch, ordering, styling, visibility, or lookup.
- Functionality is driven by explicit fields such as `action`, `url`, `icon`, and `labelKey`.

## Files

- `tools.json`: the single configuration source for `tools[]` and `toolbox_tools[]`.
- `tool_loader.js`: loads and validates the two explicit groups; there is no magic split position.
- `tool_actions.js`: action registry for built-in tool behavior.
- `../tools.js`: renders primary tools, opens/closes the toolbox, and renders toolbox tools.
- `../tools_unfold_animation.js`: toolbox-tool unfold animation.

## Extension rules

Add a new primary button to `tools[]` and give it the next `tool_N` ID. Add a new toolbox entry to `toolbox_tools[]` and give it the next `toolbox_tool_N` ID. No total-count constant is required.


## Stable horizontal anchor and keyboard focus

- `tool_*` positions are anchored to the centered width of the fully expanded row.
- Opening/closing the toolbox only reveals/hides `toolbox_tool_*` to the right; it does not recenter `tool_*`.
- Geometry used for the anchor: 48 CSS px per button + 8 CSS px gap. Six visible buttons = `6*48 + 5*8 = 328px`.
- `tool_4` prevents default focus transfer on `pointerdown`, so toggling the toolbox does not blur the post textarea or dismiss Gboard.
- The `click` event remains responsible for the actual toolbox toggle.
