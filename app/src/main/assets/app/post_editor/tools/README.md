# Post Editor Tools / Toolbox

The New/Edit Post tool row is data-driven. `tools[]` is the canonical model; expansion never mutates it.

## Canonical model

```text
tools
├── tool_1       name = AddVideoButton
├── tool_2       name = AddImageButton
├── tool_3       name = AddAudioButton
└── tool_m1      name = ToolboxButton   <- toolbox anchor
    ├── toolbox_1    name = DictionaryButton
    ├── toolbox_2    name = SentencesButton
    ├── toolbox_3    name = GoogleButton
    └── toolbox_N    name = ...
```

- `tool_N`: normal primary Tool.
- `tool_m1`: the Toolbox anchor. `m1` expresses the special "minus/left expansion" role; it is not "tool 4".
- `toolbox_N`: child of `tool_m1`.
- `name`: maintainer-only metadata. Runtime behavior must never branch on it.
- Behavior comes from `type`, `action`, `url`, `fallbackUrl`, `icon`, and `labelKey`.

## Left-cover expansion

Collapsed:

```text
[Video] [Image] [Audio] [Toolbox]
```

Expanded with three children:

```text
[Google] [Sentence] [Dictionary] [Toolbox]
```

The algorithm finds the `tool_m1` visual slot, then places child 1 at `anchor - 1`, child 2 at `anchor - 2`, etc. Existing primary tools are only temporarily covered. The original `tools[]` is never overwritten, so closing the Toolbox restores it without reconstruction.

## Capacity

`assets/config/config.json -> new_post_tools.maximum_visible_tools` is the only maximum-capacity setting. The current default is 6. Rendering must never exceed it, and the 48px tool touch target must not be compressed to fit extra items.

## Reusable toolbox-page template

Every current/future `toolbox_N` URL entry uses the same native `ToolPageController`:

- Back: closes the Tool page and resumes the editor.
- Resource action short press: opens the modular Text / Audio / Image / Video source capture panel.
- Audio/note action long press: refreshes only the current Tool web page.
- Captured green audio filename short press: add to current Post.
- Captured filename long press (green or red): save directly to `Downloads/Jet Note/` through `MediaDownloadController`.
- No legacy Save-As / Not Now / Download dialog may be reintroduced.

## Fallback web tool

`toolbox_3` demonstrates a reusable primary/fallback URL entry. Native code probes the primary URL using an HTTP timeout from `config.json`; if unavailable it probes the fallback. If both fail, an Android-native rounded Jet Note notice is shown.

## Files

- `tools.json`: canonical nested Tool/Toolbox data.
- `tool_loader.js`: `Tool`, `Toolbox`, config capacity, and left-cover slot calculation.
- `tool_actions.js`: built-in action registry.
- `../tools.js`: rendering/toggle logic.
- `../tools_unfold_animation.js`: visual child-entry animation.
- `assets/get_source/`: shared source capture project with core, type modules and its own config.
- `ToolPageController.java`: reusable native toolbox page host.
