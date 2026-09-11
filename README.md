# Jet Note

Jet Note is a **local-first Android note-taking app** designed for fast, lightweight capture of text, images, and audio. Instead of behaving like a traditional document-oriented notebook, Jet Note presents notes as a personal activity feed: open the app, write something, attach media if needed, and publish it to your own local space.

## Features

- **Post-style notes** — Capture thoughts in a lightweight feed rather than a document hierarchy.
- **Video attachments** — Attach local videos to a post; image and video attachments are mutually exclusive within the same post. Videos can be opened in the media viewer and pinch-zoomed.
- **Image attachments** — Select images from the Android system picker and attach them to posts.
- **Audio attachments** — Attach audio files and play them from compact speaker controls inside a post. Multiple audio attachments are distinguished with numbered indicators.
- **Fast composer** — Tapping the post composer immediately focuses the text field and opens the keyboard.
- **Dictionary** — An integrated Merriam-Webster WebView for looking up English words and accessing pronunciation audio.
- **Sentences** — An integrated Sound of Text WebView for generating and retrieving sentence audio.
- **Get Audio** — Dictionary and sentence tools can discover available audio resources from their respective pages.
- **Chinese and English UI** — Core UI text and the Dictionary/Sentence toolbars support both languages.
- **Custom backgrounds** — Use an image background or the built-in RGB background.
- **Custom profile** — Change the username and avatar, with avatar cropping and shape options.
- **Local backup and restore** — Export posts, media, username, and avatar into a portable `.jnote` archive.
- **User workspace and Demo session** — Personal notes remain persistent, while the bundled demonstration is a disposable read-only session.
- **Local-first storage** — Core note data does not require a Jet Note cloud account or remote backend.

## User Workspace and Demo Session

Jet Note provides two distinct workspace behaviors:

- **User Mode** — The only persistent, writable workspace for personal data.
- **Demo Mode** — A read-only display session constructed from the bundled archive.

User data remains in its persistent local storage. Each time Demo Mode is entered,
Jet Note clears the previous demo session, validates `demo.jnote`, installs its media
into a cache-backed demo directory, and renders the bundled posts. Demo Mode hides
post creation, editing, deletion, profile changes, import, and export. Returning to
User Mode deletes the temporary demo database and media only; it never touches user
posts or user media.

Existing data from versions released before mode separation remains associated with **Usage Mode**.

Demo Mode is reconstructed from the bundled archive:

```text
app/src/main/assets/demo.jnote
```

The bundled file uses the same `.jnote` archive format as regular Jet Note backups. This makes demo content replaceable without introducing a separate demo-data format.

## `.jnote` Backup Format

Jet Note exports backups with the custom extension:

```text
.jnote
```

A `.jnote` file is internally a **ZIP container**. The current archive format uses `formatVersion 2`.

A typical archive looks like this:

```text
JetNote_xxx.jnote
├── manifest.json
├── checksums.json
├── data/
│   ├── posts.json
│   └── profile.json
└── media/
    ├── ...jpg
    ├── ...png
    ├── ...mp3
    └── ...
```

### Archive contents

- `manifest.json` describes the Jet Note archive format, version, and content locations.
- `data/posts.json` stores post text, timestamps, stable IDs, and attachment metadata.
- `data/profile.json` stores the username and avatar state.
- `media/` contains image and audio attachments as binary files.
- `checksums.json` contains SHA-256 checksums used to detect missing, corrupted, or unexpectedly modified archive content.

Media is not re-encoded merely for backup. Images and audio are stored as their media data inside the archive, so the export/import process itself does not intentionally reduce media quality.

New exports use `.jnote`. Import logic retains compatibility with the older `.jet-note` extension where supported by the current implementation.

> Current v2 backups include posts, attachments, username, and avatar. Some appearance and application preferences remain local rather than being part of the backup.

## Backup and Restore Flow

During export, Jet Note gathers structured post/profile data, adds referenced media files, calculates integrity information, and writes the result into the `.jnote` ZIP container.

During import, the archive is validated before its contents are committed. The implementation checks the archive structure and media integrity and uses staging/commit logic to reduce the chance of leaving a partially restored dataset after a failed import.

The `.jnote` extension is therefore a Jet Note file identity; it does not imply a proprietary compression algorithm. Internally, the project continues to use a versioned ZIP-based container.

## Data and Privacy

Jet Note is designed around local storage:

- Post data is stored locally using IndexedDB.
- Attachments are stored in the application's private media storage.
- Appearance and application preferences are stored locally.
- Backup files are created only when the user explicitly exports data.
- User Mode is persistent; Demo Mode uses disposable session storage.

The core note system does not depend on a Jet Note server.

## Launcher Icon Generation

The rounded launcher icon is generated during the Android resource merge rather
than maintained as a separate hand-edited image. Its source and rule are:

```text
app/src/main/res/drawable/icon.png
app/src/main/res/drawable-nodpi/make_round_png.json
```

The JSON rule controls the output file name, size and corner radius. The build
copies regular resources into its generated resource directory, then produces
`drawable-nodpi/icon_rounded.png` from that rule for the manifest to use.

The **Dictionary** and **Sentences** features are exceptions to the offline-first model because they load third-party websites. Network availability, regional accessibility, and the behavior of those services can affect these features.

## Dictionary

The Dictionary tool opens:

```text
https://www.merriam-webster.com/
```

It provides a dedicated Jet Note toolbar and **Get Audio** action for pronunciation resources.

## Sentences

The Sentences tool opens:

```text
https://soundoftext.com/
```

It is intended for generating sentence speech and retrieving the resulting audio.

Both web tools share Jet Note-style loading and failure states. When navigation fails, the app attempts to display the actual WebView or HTTP error information instead of relying solely on a blank page or the browser's default error UI.

## Project Architecture

Jet Note uses a hybrid architecture:

```text
Android Java layer
        │
        ├── WebView host and navigation
        ├── Android file pickers
        ├── attachment storage
        ├── .jnote import/export
        └── native bridges
        │
        ▼
Local HTML / CSS / JavaScript UI
        │
        ├── posts
        ├── settings
        ├── attachments
        ├── localization
        └── local IndexedDB / storage
```

Important project locations:

```text
JetNote/
├── app/
│   ├── build.gradle
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/ingeniousidea/space/
│       │   ├── MainActivity.java
│       │   ├── DictionaryController.java
│       │   ├── AttachmentStore.java
│       │   ├── AttachmentPickerController.java
│       │   ├── JetNoteArchiveController.java
│       │   ├── NativeBridge.java
│       │   └── ...
│       ├── assets/
│       │   ├── index.html
│       │   ├── demo.jnote
│       │   ├── css/
│       │   ├── js/
│       │   ├── icons/
│       │   └── images/
│       └── res/
├── docs/
├── build.gradle
├── settings.gradle
└── README.md
```

The local web UI is implemented with HTML, CSS, and JavaScript. Android-specific capabilities such as WebView integration, system file selection, media persistence, and archive handling are implemented in Java.

## Technical Requirements

| Item | Configuration |
| --- | --- |
| Application ID | `com.ingeniousidea.space` |
| Minimum SDK | 23 |
| Target SDK | 34 |
| Compile SDK | 34 |
| Java | 17 |
| Android Gradle Plugin | 8.2.2 |

Version information may change as the project evolves; check `app/build.gradle` for the authoritative current version.

## Building

The repository is intentionally kept free of generated build output and machine-specific configuration.

### Android Studio

Open the project root in Android Studio and make sure the environment provides:

- JDK 17
- Android SDK 34
- A Gradle version compatible with Android Gradle Plugin 8.2.2

Then build the Debug variant normally.

### Termux Studio

When using a Termux Android Studio environment that provides the `studio` command:

```bash
cd /path/to/JetNote
studio build .
```

If Android reports that a newly built APK has a signature inconsistent with the installed application, the new APK was signed with a different key. Updating an existing installation requires the same signing identity that was used for the installed APK.

## Source Formatting

Project-owned source code is intended to remain readable and maintainable. CSS and JavaScript should use normal formatted, multi-line source rather than intentionally minified production-style formatting unless there is a specific technical reason to do otherwise.

## Third-Party Resources

Speaker icons used by the project are derived from **Feather Icons**. Keep the accompanying license file with redistributed copies:

```text
app/src/main/assets/icons/FEATHER-LICENSE.txt
```

Merriam-Webster and Sound of Text are third-party web services and are not part of Jet Note itself.

## Project Philosophy

Jet Note deliberately focuses on a small set of interactions:

**capture quickly, keep friction low, store data locally, and let media feel like part of the note rather than a separate workflow.**

It is particularly suited to:

- quick personal notes,
- English-learning notes,
- saving pronunciation or sentence audio,
- image-and-text journaling,
- short daily records,
- users who prefer a local-first notebook without a required cloud account.

## License

No project-level open-source license is currently declared in the repository. Before distributing Jet Note as an open-source project or accepting external contributions, add a `LICENSE` file that clearly states the licensing terms.

Third-party resources remain subject to their respective licenses.
