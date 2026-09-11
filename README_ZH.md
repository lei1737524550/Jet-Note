# Jet Note

[English](README.md) | 中文

Jet Note 是一款面向 Android 的轻量级本地笔记应用，采用 **原生 Android +
WebView 前端**
的混合架构。它以类似社交动态/空间的方式组织随手记录，支持文字、图片、音频和视频，并内置词典、句子记录、相册、外观设置、本地备份与
`.jnote` 数据归档。

当前项目版本：**3.7**\
Android 包名：`com.ingeniousidea.space`\
最低 Android 版本：**Android 6.0（API 23）**\
目标 API：**34**

## 主要功能

### 动态式笔记

首页以信息流形式展示记录，可以发布和编辑笔记。笔记支持：

-   纯文字
-   图片
-   音频
-   视频
-   多媒体附件
-   删除与编辑已有内容

媒体数据并非简单依赖外部文件 URI，而是可以复制到 Jet Note
自己的媒体存储中，由应用统一管理。

### 图片与相册

Jet Note 支持从 Android 图片选择器导入图片，并提供：

-   图片附件
-   图片查看
-   裁剪
-   相册管理
-   背景图片
-   头像设置

媒体展示与笔记数据相互关联，同时保留独立的媒体管理逻辑。

### 音频

笔记可以添加音频附件。应用包含独立的音频加载、播放和保存逻辑。

词典页面还支持从网页中发现可能的发音音频资源，并将音频保存到本地。

### 视频

笔记支持视频附件和内嵌播放。

视频模块包含：

-   视频选择
-   视频缩略图
-   点击后按需加载真实视频
-   播放 / 暂停
-   播放进度
-   视频时间显示
-   并发播放数量限制
-   Android 原生视频播放支持

`assets/config/video-playback.json` 用于配置视频播放行为。当前配置：

``` json
{
  "maxConcurrentPlayingVideos": 1
}
```

即同一时间最多保留一个活动视频播放器。

### 词典

Jet Note 内置独立的词典 WebView 工具页，由 `DictionaryController` 管理。

除网页浏览外，还包含：

-   发音音频资源检测
-   音频播放
-   音频下载/保存
-   网页缓存统计
-   网页缓存清理
-   关闭词典页时清理缓存的策略

### 句子

首页提供独立的"句子"入口，用于将句子类内容与普通动态记录区分开，适合快速记录和复习短句。

### Demo 模式

Jet Note 将正常用户空间和 Demo 会话分离。

`assets/demo.json` 控制默认模式和 Demo 开关：

``` json
{
  "launch_mode": "user",
  "display_demo_switch": true,
  "demo_policy": "read_only_session"
}
```

其中：

-   `launch_mode`：安装包默认启动模式
-   `display_demo_switch`：是否在设置中显示 Demo 模式切换入口
-   `demo_policy`：Demo 会话策略

Demo
模式使用独立的数据命名空间，并限制部分会修改正式用户数据的功能。退出
Demo 时会清理 Demo 会话数据，而不会删除正式用户媒体。

### 本地备份与 `.jnote`

Jet Note 提供专用的 `.jnote` 归档格式，用于完整导入和导出应用数据。

归档逻辑由：

`JetNoteArchiveController.java`

负责，包含：

-   数据导出
-   ZIP 打包
-   数据导入
-   临时解包
-   JSON 数据检查
-   附件检查
-   SHA-256 校验
-   媒体提交
-   导入失败回滚

导入流程采用"暂存 → 验证 → 提交"的方式，尽量避免损坏现有用户数据。

Android Manifest 同时注册了 Jet Note 归档 MIME 类型，因此 Android
可以将相应 `.jnote` 文件交给 Jet Note 打开。

## 项目架构

Jet Note 并不是纯原生 Android UI 应用。

主要架构为：

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

Web 层负责主要 UI 和业务交互，Android
原生层负责系统能力、文件访问、媒体存储、词典
WebView、归档和原生视频等功能。

## 目录结构

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

## Android 原生模块

### `MainActivity.java`

应用主 Activity，也是 Android 原生层的总入口。

主要负责：

-   创建和配置主 WebView
-   加载 Jet Note 前端
-   注册 JavaScript Bridge
-   初始化各个 Controller
-   处理应用内资源
-   处理媒体请求
-   处理视频资源与缩略图
-   接收 Android Intent
-   协调原生层生命周期

### `NativeBridge.java`

Web 前端与 Android 原生层之间的接口。

调用关系大致为：

``` text
JavaScript
    ↓
NativeBridge
    ↓
Android Controller
```

前端需要选择文件、访问 Demo
配置、管理网页缓存、执行归档等原生操作时，会通过这一层进入 Android。

### `AttachmentStore.java`

Jet Note 的原生附件仓库。

负责：

-   导入媒体
-   保存媒体文件
-   读取媒体
-   删除媒体
-   MIME 类型处理
-   文件大小记录
-   SHA-256 计算
-   图片尺寸等媒体元数据

附件采用原始字节复制方式保存，正常导入过程不会为了存储而重新编码图片、音频或视频。

### `AttachmentPickerController.java`

负责调用 Android 系统文件/媒体选择能力，并将用户选择的附件交回 Jet
Note。

### `ImagePickerController.java`

负责图片选择，主要用于需要 Android 图片选择器的场景。

### `MediaWriteController.java`

负责媒体写入相关的原生操作。

### `AudioSaveController.java`

负责音频资源保存，主要与词典发音音频保存功能配合。

### `DictionaryController.java`

管理词典工具页。

除了 WebView
生命周期和网页导航外，还负责词典相关的原生能力以及网页缓存管理。

### `NativeVideoPlayer.java`

Android 原生视频播放器模块，用于播放 Jet Note 管理的视频资源。

### `JetNoteArchiveController.java`

负责 `.jnote` 归档，是数据迁移和备份的核心原生模块。

### `EdgeToEdgeController.java`

负责 Android 状态栏、导航栏、安全区域和 Edge-to-Edge 显示适配。

## Web 前端

### `assets/index.html`

Jet Note 主界面的 HTML 入口。

包含首页、用户资料、功能入口、编辑器和各类页面容器。

### `assets/js/core/`

前端基础设施层。

  文件                   作用
  ---------------------- ------------------------------
  `bootstrap.js`         前端初始化与启动流程
  `storage.js`           本地数据与模式命名空间管理
  `entries.js`           笔记条目数据管理
  `navigation.js`        页面导航与返回逻辑
  `i18n.js`              中英文国际化
  `dom.js`               DOM 辅助函数
  `viewport.js`          WebView 视口适配
  `archive.js`           Web 侧归档处理
  `archive-mapping.js`   归档数据映射
  `media-adapter.js`     Web 数据与原生媒体之间的适配

### `assets/js/features/`

主要业务功能。

  文件              作用
  ----------------- -------------------------------
  `posts.js`        动态/笔记发布、编辑和媒体处理
  `album.js`        相册
  `audio.js`        音频附件和视频内嵌播放
  `profile.js`      用户名称、头像等资料
  `appearance.js`   背景和外观
  `settings.js`     设置、Demo 模式和网页缓存
  `transfer.js`     数据导入、导出与迁移

### `assets/js/components/`

可复用 UI 组件。

  文件                作用
  ------------------- -----------------
  `confirmation.js`   确认操作
  `crop.js`           图片裁剪
  `media.js`          媒体组件
  `menu.js`           菜单
  `notice.js`         提示信息
  `viewer.js`         图片/媒体查看器

### CSS

  文件                作用
  ------------------- ------------------------
  `base.css`          全局基础样式
  `layout.css`        页面总体布局
  `components.css`    UI 组件
  `pages.css`         各功能页面
  `attachments.css`   图片、音频、视频等附件

## 第三方库

`assets/vendor/` 当前包含：

-   `fflate.js`：ZIP 压缩与解压
-   `sha256.js`：SHA-256 哈希

对应的 LICENSE 文件已随项目保留。

图标目录中也保留了 Feather 图标许可证。

## 图标生成

Jet Note 的 Android 图标支持在构建时自动生成圆角版本。

规则位于：

``` text
app/src/main/res/drawable-nodpi/make_round_png.json
```

源图片：

``` text
app/src/main/res/drawable/icon.png
```

`app/build.gradle` 中的 `generateJetNoteResources` 任务会：

1.  读取 JSON 规则；
2.  加载原始图标；
3.  按配置缩放；
4.  裁剪圆角；
5.  生成 Android 最终使用的 `icon_rounded.png`；
6.  将处理后的资源目录交给 Android 构建系统。

因此圆角图标属于可重新生成的构建资源。

## 构建

项目使用 Android Gradle 构建。

环境要求：

-   JDK 17
-   Android SDK
-   compileSdk 34
-   Gradle / Android Gradle Plugin 环境

调试版可使用：

``` bash
gradle :app:assembleDebug
```

Release：

``` bash
gradle :app:assembleRelease
```

生成的 APK 位于 Gradle 标准输出目录：

``` text
app/build/outputs/apk/
```

## 数据设计

Jet Note 的设计重点之一是将"笔记数据"和"媒体文件"分开管理。

大致关系：

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
       App private storage
```

Web 层负责记录附件引用，Android 原生层负责真实媒体文件。

这种方式避免长期依赖外部相册 URI，也使 `.jnote`
完整备份、校验和恢复成为可能。

## 设计原则

Jet Note 当前代码体现了几个主要方向：

**本地优先。**\
笔记、设置和媒体主要由设备本地保存，不依赖云端账户才能完成核心记录功能。

**轻量界面。**\
主要 UI 使用 HTML/CSS 构建，保持动态式、随手记式的交互。

**媒体统一管理。**\
图片、音频和视频通过统一的附件体系与笔记关联。

**可迁移。**\
`.jnote` 将结构化数据与媒体一起归档，而不是只导出文本。

**用户空间与 Demo 隔离。**\
Demo 数据使用独立命名空间和临时媒体空间，避免演示内容污染正式笔记。

**Web 与 Native 分工。**\
Web 层负责快速构建界面和交互，Android 层负责更适合原生实现的系统能力。

## 开发提示

修改首页和页面结构：

``` text
app/src/main/assets/index.html
```

修改动态/笔记：

``` text
app/src/main/assets/js/features/posts.js
```

修改设置：

``` text
app/src/main/assets/js/features/settings.js
```

修改媒体播放：

``` text
app/src/main/assets/js/features/audio.js
app/src/main/java/com/ingeniousidea/space/NativeVideoPlayer.java
```

修改媒体存储：

``` text
app/src/main/java/com/ingeniousidea/space/AttachmentStore.java
```

修改 `.jnote`：

``` text
app/src/main/java/com/ingeniousidea/space/JetNoteArchiveController.java
app/src/main/assets/js/core/archive.js
app/src/main/assets/js/core/archive-mapping.js
```

修改词典：

``` text
app/src/main/java/com/ingeniousidea/space/DictionaryController.java
app/src/main/assets/js/dictionary-get.js
```

修改外观：

``` text
app/src/main/assets/js/features/appearance.js
app/src/main/assets/css/
```

修改 App 默认 Demo 行为：

``` text
app/src/main/assets/demo.json
```

修改视频并发播放配置：

``` text
app/src/main/assets/config/video-playback.json
```

## 当前定位

Jet Note 更接近一种
**"动态式本地随手记"**，而不是传统的文件夹式笔记软件。

它希望把记录这件事变得像发布一条动态一样简单，同时保留本地存储、多媒体、词典、句子、备份和数据迁移等能力。
