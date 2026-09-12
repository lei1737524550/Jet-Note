# Edit Post regression checklist

Run these checks on an Android device before release:

1. Create a text-only post, press **Post**, and confirm it appears in the feed.
2. Create a post with an audio attachment, an image attachment, and a video attachment (images and video remain mutually exclusive).
3. Enter text, open the keyboard, close it, and verify the white Composer still covers the feed.
4. Enter text, open a configured tool, return, and verify text, caret position, attachments, and scroll position remain intact.
5. Edit an existing post, cancel, and confirm the stored post is unchanged; then edit and save it.
6. Send the app to the background while editing, return, and verify the editor remains visible and its draft remains available.
7. Open and close the editor ten times, then repeat the text-only publish check.

The single `ViewportManager` is the only module that listens to browser viewport changes. Composer layout consumes its CSS variables; feature code must not add its own resize listeners or set Composer dimensions directly.
