# Get Source

`get_source/` is the page-resource capture module used by toolbox web pages.

- `get_source.js` — shared observer, candidate store, panel, tabs, sorting, long-press save.
- `get_text.js` — text/source-file classification and rendering.
- `get_audio.js` — audio classification, preview, add-to-post action.
- `get_image.js` — image classification, compressed thumbnails, shared Image Viewer launch.
- `get_video.js` — video classification, compressed previews, shared Viewer launch.
- `config.json` — extension filters, per-type priority and result colors.

The four resource types are intentionally separate. Add or reorder common extensions in `config.json`; do not duplicate extension lists inside the renderers unless a URL-semantic fallback is required.

Default priorities: TXT/MD first for text, MP3 first for audio, PNG/JPG first for images, MP4 first for video.

The result panel header uses a 1:1 split: close control on the left half, four equal Text/Audio/Image/Video controls inside the right half. Matching resources are green and sorted first; other captured candidates remain visible in red behind them.

## Classification and viewer layering

- Configured file extensions are authoritative. A `.jpg`/`.jpeg` resource is Image even when its URL contains video-like words. URL/hint heuristics are fallback-only for unknown or extensionless resources.
- Get Source panel uses `layers.get_source_panel_z_index`; the shared Image/Video Viewer uses the higher `layers.get_source_image_video_viewer_z_index` and is promoted to `document.body` before opening.


## Get Source panel interaction
- The native top-right red SVG opens Get Source; while open it changes to the green SVG.
- Clicking the green SVG closes Get Source. The panel has no internal close button.
- Get Source panel and ordinary child boxes use `config.json -> global_set_body`.
- Background whitelist exemptions are limited to `image_video_viewer_backdrop` and `video_preview_surface`.
- Viewer close control: short press closes; long press saves the current image/video. Tap/focus highlight is disabled.
- Layer config keys: `layers.get_source_panel_z_index` and `layers.get_source_image_video_viewer_z_index`.

- Browser Settings may inject `JET_NOTE_GET_SOURCE_EXTENSION_FILTER`. An empty array means no filtering; a non-empty array is a strict extension whitelist.
