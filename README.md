# Jet Note

Jet Note 是一款 **本地优先（Local-first）** 的 Android 随手记应用，专注于快速记录文字、图片和音频，并提供轻量的词典、句子发音与本地备份能力。

它不是传统的重型笔记软件，更接近一个可以随手打开、立即记录的个人动态空间：写下一段文字，附上一张图片或一段声音，然后让内容保留在自己的设备里。

## 功能特色

- **说说式随手记**：用接近动态流的方式记录日常内容。
- **图片附件**：支持从系统选择图片并作为说说附件保存。
- **音频附件**：支持选择音频文件；发布后以紧凑的扬声器图标展示，多个音频会使用数字下标区分。
- **快速编辑体验**：点击“分享新鲜事”即可进入编辑状态，并自动聚焦输入框。
- **词典**：内置 Merriam-Webster WebView，方便查询英文单词与获取发音音频。
- **句子发音**：内置 Sound of Text WebView，用于生成和获取句子音频。
- **中英文界面**：应用主要界面以及词典/句子顶部栏支持中文和英文。
- **背景设置**：支持图片背景和 RGB 背景；默认 RGB 为 `rgb(240, 255, 230)`。
- **头像设置**：支持圆形与方形头像显示及裁剪。
- **本地数据备份**：可将说说及附件导出为 `.jnote` 文件，并重新导入恢复。
- **离线优先**：说说、附件和设置主要保存在本地；词典和句子功能需要网络访问对应网站。

## `.jnote` 备份格式

Jet Note 使用自定义扩展名：

```text
.jnote
```

`.jnote` 本质上是一个 ZIP 容器，当前格式版本为 `formatVersion 2`。

典型结构：

```text
JetNote_xxx.jnote
├── manifest.json
├── checksums.json
├── data/
│   └── posts.json
└── media/
    ├── ...jpg
    ├── ...png
    ├── ...mp3
    └── ...
```

其中：

- `manifest.json`：描述 Jet Note 备份格式、版本和内容入口。
- `data/posts.json`：保存说说文本、时间、ID 和附件元数据。
- `media/`：保存图片、音频等附件的原始二进制内容。
- `checksums.json`：保存 SHA-256，用于检测备份内容是否损坏或被意外修改。

媒体附件不会为了备份而重新编码，因此图片和音频不会因为导出/导入本身产生质量损失。

> 当前 v2 备份只包含说说及其附件，不包含头像、背景、语言等外观设置。

## 数据与隐私

Jet Note 采用本地优先的数据结构：

- 说说数据主要保存在 IndexedDB。
- 附件保存在应用私有媒体目录。
- 背景与外观设置保存在本地设置存储中。
- 导出备份时，结构化数据与媒体附件会被整理进 `.jnote` 文件。

除用户主动使用“词典”或“句子”功能访问第三方网站外，Jet Note 的核心笔记数据不依赖远程服务器。

## 词典与句子

Jet Note 提供两个独立 WebView 工具：

### Dictionary

默认访问：

```text
https://www.merriam-webster.com/
```

用于查询英文词义和发音，并提供 **Get Audio / 获取音频** 功能。

### Sentences

默认访问：

```text
https://soundoftext.com/
```

用于生成句子语音，同样提供 **Get Audio / 获取音频** 功能。

两个页面共用统一的 Jet Note 顶部栏、返回逻辑、加载状态和错误显示。网页无法访问时，会显示加载失败状态以及能够获取到的实际错误码。

## 项目结构

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

前端界面由本地 HTML / CSS / JavaScript 驱动，Android Java 层负责 WebView、系统文件选择、媒体存储、备份导入导出等原生能力。

## 技术信息

| 项目 | 当前配置 |
| --- | --- |
| Application ID | `com.ingeniousidea.space` |
| Version | `2.5` |
| Version Code | `16` |
| Min SDK | `23` |
| Target SDK | `34` |
| Compile SDK | `34` |
| Java | `17` |
| Android Gradle Plugin | `8.2.2` |

## 构建

项目源码不包含 Gradle Wrapper、`local.properties`、构建缓存或 APK。

### Android Studio

使用 Android Studio 打开项目根目录，并准备：

- JDK 17
- Android SDK 34
- 与 AGP 8.2.2 兼容的 Gradle

然后执行 Debug 构建。

### Termux Studio

如果使用 Termux Android Studio / `studio` 工具，可以进入项目目录后执行：

```bash
studio build .
```

如果需要覆盖安装旧版本 APK，新构建必须使用与旧版本相同的签名；否则 Android 会提示 APK 签名与已安装应用不一致。

## 开源资源

项目中的扬声器图标来自 **Feather Icons**。

许可证文件：

```text
app/src/main/assets/icons/FEATHER-LICENSE.txt
```

相关资源的许可证应随项目一同保留。

## 当前定位

Jet Note 的目标不是堆叠大量复杂的笔记管理功能，而是保持：

**快速记录、低操作成本、本地保存、附件自然融入内容。**

适合用于：

- 随手记录想法
- 英语学习笔记
- 保存单词或句子相关的声音
- 图文记录
- 简短日常备忘
- 不希望依赖云端账号的个人笔记

## License

当前项目仓库未发现明确的项目级开源许可证文件。若计划公开发布或接受外部贡献，建议补充独立的 `LICENSE` 文件，并明确代码的授权方式。
