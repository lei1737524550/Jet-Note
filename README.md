# Jet Note

[English](#english) | [中文](#中文)

---

## English

Jet Note is an Android note-taking application built around a native Android shell and a local WebView UI. It is designed as an offline-first, media-capable note workspace: notes can contain text, images, video, and audio, can be favorited or archived, and can be exported/imported as `.jnote` archives.

### Highlights

- Local note creation and editing with text and media attachments.
- Image, video, and audio attachment workflows backed by Android system pickers/native storage.
- Favorites, a unique “super star” state, archive/unarchive, deletion, and note viewing.
- Dedicated image/video viewing and shared media playback infrastructure.
- `.jnote` backup and restore with archive validation, media restoration, and post-import persistence verification.
- English/Chinese UI language support.
- Configurable appearance and a built-in Color View tool with RGB, HEX/decimal display, color picker, and copy support.
- Android edge-to-edge/WebView integration, local resource routing, and runtime configuration.

### Architecture

The project intentionally separates Android platform responsibilities from WebView application logic.

`app/src/main/kotlin/com/leixj/jetnote/` contains the native layer. `MainActivity.kt` assembles the WebView and controllers; `AttachmentStore.kt`, `AttachmentPickerController.kt`, `MediaFileManager.java`, and `MediaWriteController.java` handle durable media; `BackupFileController.kt` owns `.jnote` archive I/O and validation; `LocalResourceRouter.kt` serves local resources; `RuntimeConfigStore.java` exposes runtime configuration; and the remaining bridge/view classes handle native playback, rich content, UI language, and system integration.

`app/src/main/assets/src/` contains the WebView application. It is split by responsibility into `app/` bootstrap/navigation, `bridge/android/`, `core/`, `data/notes/`, `features/editor/`, `features/home/`, `features/settings/`, and `shared/`. The home and editor features share common media, UI, theme, transition, and scrollbar modules rather than duplicating those responsibilities.

Runtime configuration is compiled into `RuntimeConfigStore.java` and exposed to the WebView through the native resource/bridge layer. There is no editable `assets/config/` directory in the current architecture.

### Data and backup model

Notes are persisted through the WebView data layer using IndexedDB-backed stores. Attachments use durable native media references when available. During export, note records are normalized and attachment bytes are materialized before the native layer creates the archive. During import, the archive is validated before media is committed; the resulting note state is then written and verified before the import is finalized.

A `.jnote` file is a ZIP-based archive intended to keep note data and referenced media together. Treat backups as user data and avoid committing real personal backups to the repository.

### Color View

Color View provides a square saturation/value field, hue strip, RGB component inputs, and a copyable output value. HEX is the default numeric format. The active HEX/DEC format option is highlighted with `#5600F7`. The preview area uses the SVG icon only; the former Chinese/Latin sample text has been removed so the icon can use the available preview space.

### Project structure

```text
Jet Note/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── kotlin/com/leixj/jetnote/   # Native Android layer
│   │   ├── res/                        # Android resources/themes/icons
│   │   └── assets/
│   │       ├── index.html              # WebView entry point
│   │       ├── locales/                # English / Chinese dictionaries
│   │       └── src/                    # Web application modules
│   └── tests/                           # JS/UI behavior tests
├── tools/                               # Verification and config utilities
├── gradle/                              # Gradle wrapper configuration
├── build.gradle.kts
├── settings.gradle.kts
└── README.md
```

### Build requirements

The current Gradle configuration targets Android with Kotlin/JVM 17. Use an Android SDK and a compatible JDK/Gradle environment. Machine-specific `local.properties` is intentionally not included in the repository.

Build a debug APK:

```sh
./gradlew :app:assembleDebug
```

On environments where the wrapper JAR is unavailable, install a compatible Gradle distribution or restore the wrapper before building.

### Verification

The repository includes lightweight checks for JavaScript syntax/resources, configuration synchronization, service behavior, media layout, archive restoration, UI sounds, and selected UI regressions.

```sh
node tools/verify.cjs
node app/tests/media_fit.test.cjs
node app/tests/archive_restore.test.cjs
node app/tests/ui_sounds.test.cjs
python3 tools/check_assets.py
```

The Playwright action-group test additionally requires Playwright and a usable browser runtime.

### Development notes

- Keep Android-specific behavior in the native/bridge layer and note/UI behavior in the corresponding Web modules.
- Prefer the existing shared media and UI modules over feature-local duplicates.
- Runtime configuration currently lives in `RuntimeConfigStore.java`; keep WebView consumers aligned with its exposed sections.
- Keep locale keys synchronized between `locales/English.json` and `locales/Chinese.json`.
- Do not commit generated build output, IDE state, SDK paths, or real user backups.

---

## 中文

Jet Note 是一个 Android 笔记应用，采用“原生 Android 外壳 + 本地 WebView 界面”的结构。项目以本地使用为主，支持文本、图片、视频和音频笔记，并提供收藏、归档、查看以及 `.jnote` 导入导出。

### 主要功能

- 创建、编辑和查看本地笔记，支持文本与多媒体附件。
- 通过 Android 系统选择器和原生存储处理图片、视频、音频。
- 普通收藏、唯一超级收藏、归档/取消归档、删除等笔记状态操作。
- 独立图片/视频查看器以及共享音视频播放模块。
- `.jnote` 备份与恢复，包含归档校验、媒体恢复和导入后的持久化校验。
- 中文/英文界面切换。
- 外观配置与 Color View 调色工具，支持 RGB、HEX/十进制显示、取色与复制。
- Android 全面屏适配、WebView 桥接、本地资源路由与运行时配置。

### 架构

项目将 Android 平台职责和 WebView 业务逻辑分开。

`app/src/main/kotlin/com/leixj/jetnote/` 是原生层。`MainActivity.kt` 负责 WebView 与控制器装配；`AttachmentStore.kt`、`AttachmentPickerController.kt`、`MediaFileManager.java`、`MediaWriteController.java` 负责附件与持久媒体；`BackupFileController.kt` 负责 `.jnote` 归档读写和校验；`LocalResourceRouter.kt` 负责本地资源响应；`RuntimeConfigStore.java` 提供运行时配置；其他类负责原生播放、富内容输入、语言和系统界面集成。

`app/src/main/assets/src/` 是 WebView 应用层，按职责拆分为 `app/` 启动与导航、`bridge/android/`、`core/`、`data/notes/`、`features/editor/`、`features/home/`、`features/settings/` 和 `shared/`。主页与编辑器尽量复用共享媒体、UI、主题、过渡动画和滚动条模块。

当前运行时配置直接编译在 `RuntimeConfigStore.java` 中，并通过原生资源/桥接层提供给 WebView；当前架构不存在可编辑的 `assets/config/` 目录。

### 数据与备份

笔记通过 WebView 数据层持久化，核心存储基于 IndexedDB。附件优先使用原生层提供的持久媒体引用。导出时会规范化笔记数据并确保附件拥有可归档的数据来源，再交给原生层生成归档；导入时先校验归档，再提交媒体和笔记数据，并在完成前重新读取持久化结果进行验证。

`.jnote` 本质上是 ZIP 归档，用于同时保存笔记数据和关联媒体。真实用户备份属于个人数据，不建议提交到 Git 仓库。

### Color View

Color View 包含方形饱和度/明度取色区、色相条、RGB 分量输入和可复制的颜色值。现在默认使用 HEX（十六进制）模式；HEX/DEC 中被选中的格式使用 `#5600F7` 显示。预览区已经移除原来的汉字和英文字母，只保留 SVG 表情图标，并将释放出来的空间用于放大图标。

### 项目结构

```text
Jet Note/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── kotlin/com/leixj/jetnote/   # Android 原生层
│   │   ├── res/                        # Android 资源/主题/图标
│   │   └── assets/
│   │       ├── index.html              # WebView 入口
│   │       ├── locales/                # 中英文语言字典
│   │       └── src/                    # Web 应用模块
│   └── tests/                           # JS/UI 行为测试
├── tools/                               # 校验与配置工具
├── gradle/                              # Gradle Wrapper 配置
├── build.gradle.kts
├── settings.gradle.kts
└── README.md
```

### 构建

当前工程使用 Kotlin/JVM 17 的 Android Gradle 配置。需要准备 Android SDK 以及兼容的 JDK/Gradle 环境。机器专属的 `local.properties` 不应进入 Git 仓库，因此本项目包中已移除。

构建 Debug APK：

```sh
./gradlew :app:assembleDebug
```

如果当前环境没有 Gradle Wrapper JAR，需要安装兼容版本的 Gradle，或者补全 Wrapper 后再构建。

### 校验

项目包含 JavaScript/资源检查、配置同步检查、服务逻辑、媒体布局、归档恢复、UI 音效和部分界面回归测试：

```sh
node tools/verify.cjs
node app/tests/media_fit.test.cjs
node app/tests/archive_restore.test.cjs
node app/tests/ui_sounds.test.cjs
python3 tools/check_assets.py
```

Playwright 的 action-group 测试还需要额外安装 Playwright 并提供可用浏览器运行环境。

### 开发约定

- Android 平台行为放在原生层/桥接层；笔记和界面业务放在对应 Web 模块。
- 优先复用现有 shared 媒体与 UI 模块，避免再次复制实现。
- 修改配置时先修改配置分片，再执行 `python3 tools/sync_config.py`。
- `locales/English.json` 与 `locales/Chinese.json` 的语言键应保持同步。
- 不要提交构建产物、IDE 状态、SDK 本机路径和真实用户 `.jnote` 备份。
