# Main-feed video scroll / seek interaction investigation

Status: traced only; behavior intentionally not changed in this revision.

## Reproduction symptom
After interacting with an inline video seek bar, normal finger scrolling can sometimes stop responding. In the same bad state, later seek-bar interaction may also stop responding.

## Highest-risk interaction boundaries found
1. `video_player.js::bindVideoProgress()` captures the pointer on seek start and owns a local `dragging/pointerId` state until `pointerup` or `pointercancel`. This is a state boundary worth instrumenting if the failure remains reproducible.
2. `NativeVideoPlayer.createInlineStage()` installs a native `stage.setOnTouchListener` that returns `true` for every motion event while the TextureView is active. Vertical movement is manually converted to `webView.scrollBy(...)`. This means the native video rectangle, rather than WebView, owns gestures that begin over a playing video.
3. Native video rectangle updates are asynchronous (`scroll` -> `requestAnimationFrame` -> `updateVideoRect`). A stale/misaligned native stage can therefore temporarily intercept touches over a region that visually appears to belong to WebView.
4. The JS seek track uses `touch-action:none`; it is correctly scoped to the track, but any missing terminal pointer event would leave its local seek state active.

## Next diagnostic step
If this bug is reproduced again, log pointerdown/pointerup/pointercancel + pointerId in `bindVideoProgress`, and ACTION_DOWN/UP/CANCEL + current native stage rectangle in `NativeVideoPlayer`. That will distinguish a stuck JS pointer-capture path from a stale native TextureView interception path before changing behavior.
