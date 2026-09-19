# Shared Image Viewer

- `configuration.js`: reads shipped/runtime viewer behavior configuration.
- `background_control.js`: image-only background cycle and its UI control.
- `close_control.js`: close-button accessibility, short-close and long-press download behavior.
- `../image_viewer.js`: open/close lifecycle plus pan/pinch/zoom gesture engine.

Post previews and Tool/Get Source previews load the same modules. Do not create page-specific copies of viewer behavior.
