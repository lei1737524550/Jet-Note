# Jet Note

English | [中文](README_ZH.md)

Jet Note is a lightweight, local-first note-taking application for
Android built with a **native Android + WebView** hybrid architecture.

Instead of organizing notes like traditional documents or folders, Jet
Note presents them in a timeline-style interface inspired by social
feeds. The goal is to make capturing everyday thoughts feel as quick and
natural as posting a status update, while keeping the data under the
user's control.

Jet Note supports text, images, audio, and video, together with a
built-in dictionary, sentence collection, album, appearance settings,
Demo mode, web-cache management, and portable `.jnote` backups.

**Current version:** 3.7\
**Android package:** `com.ingeniousidea.space`\
**Minimum Android version:** Android 6.0 (API 23)\
**Target API:** 34

## Features

### Timeline-Style Notes

The main screen displays notes as a chronological feed.

Notes can contain:

-   Text
-   Images
-   Audio
-   Video
-   Multimedia attachments

Existing entries can be edited or deleted.

Rather than permanently depending on external `content://` URIs,
imported media can be copied into Jet Note's private storage and managed
by the application itself.

### Images and Album

Jet Note integrates with Android's image picker and provides support
for:

-   Image attachments
-   Image viewing
-   Image cropping
-   Album management
-   Profile pictures
-   Custom backgrounds

Media presentation is connected to note data while the actual media
files are handled separately by the native storage layer.

### Audio

Notes can contain audio attachments with dedicated loading and playback
behavior.

The dictionary tool can also detect pronunciation audio resources from
dictionary pages and save them locally.

### Video

Jet Note supports video attachments and inline video playback.

The video system includes:

-   Video selection
-   Video thumbnails
-   Lazy loading of the real video source
-   Play and pause controls
-   Playback progress
-   Duration display
-   Concurrent playback limits
-   Native Android video playback support

Playback behavior is configurable through:

``` text
app/src/main/assets/config/video-playback.json
```

The current configuration is:

``` json
{
  "maxConcurrentPlayingVideos": 1
}
```

This means Jet Note allows only one active video player at a time.

### Dictionary

Jet Note includes a dedicated dictionary WebView managed by
`DictionaryController`.

In addition to normal web navigation, the dictionary subsystem provides:

-   Pronunciation audio discovery
-   Audio playback
-   Audio saving
-   Web cache size reporting
-   Manual web cache cleanup
-   Automatic cache cleanup policies

### Sentence Collection

A separate sentence entry point is available for storing short sentences
independently from ordinary timeline notes.

This is particularly useful for quickly collecting phrases, quotations,
or language-learning material.

### Demo Mode

Jet Note separates normal user data from temporary Demo sessions.

Default Demo behavior is controlled by:

``` text
app/src/main/assets/demo.json
```

Current configuration:

``` json
{
  "launch_mode": "user",
  "display_demo_switch": true,
  "demo_policy": "read_only_session"
}
```

The fields have separate responsibilities:

-   `launch_mode` --- default mode when the application starts
-   `display_demo_switch` --- whether the Demo switch is visible in
    Settings
-   `demo_policy` --- behavioral policy for Demo sessions

Demo mode uses a separate data namespace and restricts operations that
could modify normal user data.

When a Demo session ends, temporary Demo data can be cleared without
deleting the user's normal media library.

### `.jnote` Backup and Restore

Jet Note provides its own `.jnote` archive format for portable backups.

The native archive implementation is primarily handled by:

``` text
JetNoteArchiveController.java
```

The archive system supports:

-   Data export
-   ZIP packaging
-   Data import
-   Temporary extraction
-   JSON validation
-   Attachment validation
-   SHA-256 verification
-   Media commit
-   Import rollback

The import process follows a staged model:

``` text
Extract
   ↓
Stage
   ↓
Validate
   ↓
Commit
```

If an import cannot be completed safely, the operation can be rolled
back instead of leaving partially imported data behind.

The Android manifest also registers the Jet Note archive MIME type so
compatible `.jnote` files can be opened with Jet Note.

## Architecture

Jet Note is not a purely native Android UI application.

Its primary architecture is:

``` text
┌──────────────────────────────┐
│        Android Native        │
│                              │
│ MainActivity                 │
│ NativeBridge                 │
│ AttachmentStore              │
│ DictionaryController         │
│ JetNoteArchiveController     │
│ NativeVideoPlayer            │
└──────────────┬───────────────┘
               │
        JavaScript Bridge
               │
┌──────────────▼───────────────┐
│            WebView           │
│                              │
│ index.html                   │
│ CSS                          │
│ JavaScript                   │
└──────────────┬───────────────┘
               │
        Local Data / Media
```

The Web layer handles most of the user interface and interaction logic.

The native Android layer handles functionality that benefits from direct
platform access, including file selection, private media storage,
archive processing, dictionary WebView management, Android intents, and
native video playback.

## Project Structure

``` text
Jet-Note/
├── app/
│   ├── build.gradle
│   ├── proguard-rules.pro
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── assets/
│       │   ├── index.html
│       │   ├── demo.json
│       │   ├── config/
│       │   ├── css/
│       │   ├── icons/
│       │   ├── images/
│       │   ├── js/
│       │   │   ├── components/
│       │   │   ├── core/
│       │   │   ├── features/
│       │   │   └── dictionary-get.js
│       │   └── vendor/
│       ├── java/com/ingeniousidea/space/
│       └── res/
├── build.gradle
├── gradle.properties
└── settings.gradle
```

## Native Android Layer

### `MainActivity.java`

The main Android activity and central coordinator of the native
application layer.

Its responsibilities include:

-   Creating and configuring the main WebView
-   Loading the Jet Note frontend
-   Registering the JavaScript bridge
-   Initializing native controllers
-   Handling application resources
-   Serving local media requests
-   Handling video resources and thumbnails
-   Receiving Android intents
-   Coordinating native lifecycle events

### `NativeBridge.java`

The communication gateway between JavaScript and Android.

The general call path is:

``` text
JavaScript
    ↓
NativeBridge
    ↓
Android Controller
```

When the Web frontend needs native functionality---such as selecting
files, reading Demo configuration, managing web cache, or
importing/exporting archives---it communicates through this bridge.

### `AttachmentStore.java`

The native attachment repository.

It is responsible for:

-   Importing media
-   Storing media files
-   Reading attachments
-   Deleting attachments
-   MIME type handling
-   File-size metadata
-   SHA-256 calculation
-   Media metadata such as image dimensions

Attachments are normally stored using byte-for-byte copying rather than
unnecessary transcoding.

This helps preserve the original media data.

### `AttachmentPickerController.java`

Handles Android system file/media selection and returns selected
attachments to Jet Note.

### `ImagePickerController.java`

Handles image-selection flows that use Android's image picker.

### `MediaWriteController.java`

Handles native media-writing operations.

### `AudioSaveController.java`

Handles saving audio resources, particularly pronunciation audio
discovered through the dictionary feature.

### `DictionaryController.java`

Manages the dictionary tool WebView.

It handles dictionary-specific native behavior as well as web-cache
management.

### `NativeVideoPlayer.java`

Provides native Android playback for video resources managed by Jet
Note.

### `JetNoteArchiveController.java`

The core native component responsible for `.jnote` backup, restore,
validation, and media migration.

### `EdgeToEdgeController.java`

Handles Android status-bar, navigation-bar, safe-area, and edge-to-edge
layout behavior.

## Web Frontend

### `assets/index.html`

The main HTML entry point for the Jet Note interface.

It contains the primary application structure, including the home
screen, profile area, editors, navigation elements, and feature-page
containers.

### `assets/js/core/`

Core frontend infrastructure.

  File                   Responsibility
  ---------------------- ------------------------------------------
  `bootstrap.js`         Application initialization and startup
  `storage.js`           Local persistence and mode namespaces
  `entries.js`           Note-entry data management
  `navigation.js`        Navigation and back behavior
  `i18n.js`              Internationalization
  `dom.js`               DOM utilities
  `viewport.js`          WebView viewport handling
  `archive.js`           Web-side archive logic
  `archive-mapping.js`   Archive data mapping
  `media-adapter.js`     Bridge between Web data and native media

### `assets/js/features/`

Main application features.

  File              Responsibility
  ----------------- ---------------------------------------------------
  `posts.js`        Creating, editing, displaying, and managing notes
  `album.js`        Album functionality
  `audio.js`        Audio attachments and inline media playback
  `profile.js`      User profile data
  `appearance.js`   Background and appearance customization
  `settings.js`     Settings, Demo mode, and web-cache controls
  `transfer.js`     Data import, export, and migration

### `assets/js/components/`

Reusable frontend components.

  File                Responsibility
  ------------------- ---------------------------
  `confirmation.js`   Confirmation interactions
  `crop.js`           Image cropping
  `media.js`          Media UI components
  `menu.js`           Menus
  `notice.js`         Notifications and notices
  `viewer.js`         Image/media viewer

## Stylesheets

Jet Note separates its styling into several CSS layers:

  File                Responsibility
  ------------------- --------------------------------------------------
  `base.css`          Global and foundational styles
  `layout.css`        Main application layout
  `components.css`    Reusable UI components
  `pages.css`         Feature/page-specific styling
  `attachments.css`   Image, audio, video, and attachment presentation

## Third-Party Libraries

The `assets/vendor/` directory currently contains:

-   `fflate.js` --- ZIP compression and decompression
-   `sha256.js` --- SHA-256 hashing

Their corresponding license files are included in the project.

Licensing information for the included Feather icons is also retained.

## Build-Time Icon Generation

Jet Note can automatically generate its rounded Android application icon
during the Gradle build.

The generation rules are stored in:

``` text
app/src/main/res/drawable-nodpi/make_round_png.json
```

The source image is:

``` text
app/src/main/res/drawable/icon.png
```

The `generateJetNoteResources` task in `app/build.gradle`:

1.  Reads the JSON configuration.
2.  Loads the source icon.
3.  Resizes it according to the configuration.
4.  Applies rounded-corner clipping.
5.  Generates `icon_rounded.png`.
6.  Makes the generated resource available to the Android build system.

The rounded icon should therefore be treated as a reproducible generated
resource rather than the primary source artwork.

## Data Model

One of Jet Note's important design decisions is separating structured
note data from physical media files.

Conceptually:

``` text
Entry
 ├── text
 ├── metadata
 └── attachments[]
        ├── image
        ├── audio
        └── video
             ↓
       AttachmentStore
             ↓
       App Private Storage
```

The Web layer stores references to attachments, while the native Android
layer manages the physical media.

This avoids long-term dependence on external gallery URIs and makes
complete `.jnote` backup, validation, and restoration possible.

## Building the Project

The project uses the Android Gradle build system.

Recommended environment:

-   JDK 17
-   Android SDK
-   compileSdk 34
-   A compatible Gradle / Android Gradle Plugin environment

Build a debug APK with:

``` bash
gradle :app:assembleDebug
```

Build a release APK with:

``` bash
gradle :app:assembleRelease
```

Generated APKs are available under the standard Gradle output directory:

``` text
app/build/outputs/apk/
```

## Development Guide

To modify the main UI structure:

``` text
app/src/main/assets/index.html
```

To modify timeline notes:

``` text
app/src/main/assets/js/features/posts.js
```

To modify Settings:

``` text
app/src/main/assets/js/features/settings.js
```

To modify media playback:

``` text
app/src/main/assets/js/features/audio.js
app/src/main/java/com/ingeniousidea/space/NativeVideoPlayer.java
```

To modify attachment storage:

``` text
app/src/main/java/com/ingeniousidea/space/AttachmentStore.java
```

To modify `.jnote` import/export:

``` text
app/src/main/java/com/ingeniousidea/space/JetNoteArchiveController.java
app/src/main/assets/js/core/archive.js
app/src/main/assets/js/core/archive-mapping.js
```

To modify the dictionary:

``` text
app/src/main/java/com/ingeniousidea/space/DictionaryController.java
app/src/main/assets/js/dictionary-get.js
```

To modify appearance:

``` text
app/src/main/assets/js/features/appearance.js
app/src/main/assets/css/
```

To modify default Demo behavior:

``` text
app/src/main/assets/demo.json
```

To modify video playback limits:

``` text
app/src/main/assets/config/video-playback.json
```

## Design Principles

### Local First

Core note-taking functionality does not require a cloud account. Notes,
settings, and media are primarily stored on the device.

### Quick Capture

Jet Note intentionally uses a timeline-style interaction model so
creating a note feels closer to posting a short status update than
editing a traditional document.

### Unified Media Management

Images, audio, and video are connected to notes through a common
attachment system.

### Portable Data

The `.jnote` format packages structured application data together with
its media so backups are not limited to plain text.

### Demo Isolation

Demo data uses a separate namespace and temporary media space so
demonstrations do not contaminate normal user notes.

### Web and Native Separation

The Web layer provides flexible UI development, while Android-native
components handle platform-specific capabilities and storage-sensitive
operations.

## Project Philosophy

Jet Note is best described as a **timeline-style local notebook for
quick capture**.

It is designed around a simple idea:

> Writing a note should feel as effortless as posting an update.

The social-feed-inspired interface is only an interaction model. The
notes remain local, portable, and controlled by the user.
