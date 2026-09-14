# File Task Manager

This is the shared base for Jet Note file output tasks.

- DOWNLOAD and EXPORT share one lifecycle and one immediate in-app feedback surface.
- Default destination: `/Download/Jet Note/`.
- Missing destination directories are created through MediaStore on Android 10+ and recursively on legacy Android.
- If the destination cannot be created or opened, the task is blocked and a storage error dialog is shown.
- Download STARTED is emitted when the first input read is available for persistence, not merely when the user long-presses.
- COMPLETED is emitted only after output has been flushed and the destination has been committed.
- User-facing file-task text and path labels are configured in `assets/language/english.json`.

Compatibility entry points such as `MediaDownloadController` delegate to `FileTaskManager` so existing callers use the same base behavior.
