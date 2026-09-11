# AndroidManifest.xml — 双语逐行备注 / Bilingual line notes

原文件保持不变，以下备注按原文件行号对应。JSON 和第三方压缩库不插入行内注释，以避免破坏解析或依赖完整性。

The source file remains unchanged. These notes map to its original line numbers. JSON and minified third-party libraries receive sidecar notes so parsing and dependency integrity stay intact.

| 行 / Line | 原始内容 / Source | 中文备注 | English note |
| ---: | --- | --- | --- |
| 1 | <code>&lt;?xml version="1.0" encoding="utf-8"?&gt;</code> | 声明 XML 文件格式和编码。 | Declares the XML file format and encoding. |
| 2 | <code>&lt;manifest xmlns:android="http://schemas.android.com/apk/res/android"&gt;</code> | 定义或配置 HTML/XML 元素 <manifest> 及其属性。 | Defines or configures the HTML/XML <manifest> element and its attributes. |
| 3 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 4 | <code>    &lt;uses-permission android:name="android.permission.INTERNET" /&gt;</code> | 定义或配置 HTML/XML 元素 <uses-permission> 及其属性。 | Defines or configures the HTML/XML <uses-permission> element and its attributes. |
| 5 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 6 | <code>    &lt;application</code> | 定义或配置 HTML/XML 元素 <application> 及其属性。 | Defines or configures the HTML/XML <application> element and its attributes. |
| 7 | <code>        </code> | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 8 | <code>        android:icon="@drawable/icon_rounded"</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 9 | <code>        android:roundIcon="@drawable/icon_rounded"</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 10 | <code>        android:allowBackup="true"</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 11 | <code>        android:forceDarkAllowed="false"</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 12 | <code>        android:hardwareAccelerated="true"</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 13 | <code>        android:label="Jet Note"</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 14 | <code>        android:supportsRtl="true"</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 15 | <code>        android:theme="@android:style/Theme.Material.Light.NoActionBar"</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 16 | <code>        android:usesCleartextTraffic="false"&gt;</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 17 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 18 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 19 | <code>        &lt;activity</code> | 定义或配置 HTML/XML 元素 <activity> 及其属性。 | Defines or configures the HTML/XML <activity> element and its attributes. |
| 20 | <code>            android:name=".MainActivity"</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 21 | <code>            android:configChanges="keyboard&#124;keyboardHidden&#124;orientation&#124;screenSize"</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 22 | <code>            android:exported="true"</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 23 | <code>            android:launchMode="singleTop"</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 24 | <code>            android:screenOrientation="portrait"</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 25 | <code>            android:windowSoftInputMode="adjustResize"&gt;</code> | 组成 HTML/XML 文档结构或资源配置。 | Forms part of the HTML/XML document structure or resource configuration. |
| 26 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 27 | <code>            &lt;intent-filter&gt;</code> | 定义或配置 HTML/XML 元素 <intent-filter> 及其属性。 | Defines or configures the HTML/XML <intent-filter> element and its attributes. |
| 28 | <code>                &lt;action android:name="android.intent.action.MAIN" /&gt;</code> | 定义或配置 HTML/XML 元素 <action> 及其属性。 | Defines or configures the HTML/XML <action> element and its attributes. |
| 29 | <code>                &lt;category android:name="android.intent.category.LAUNCHER" /&gt;</code> | 定义或配置 HTML/XML 元素 <category> 及其属性。 | Defines or configures the HTML/XML <category> element and its attributes. |
| 30 | <code>            &lt;/intent-filter&gt;</code> | 关闭前面打开的 HTML/XML 元素。 | Closes a previously opened HTML/XML element. |
| 31 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 32 | <code>            &lt;intent-filter&gt;</code> | 定义或配置 HTML/XML 元素 <intent-filter> 及其属性。 | Defines or configures the HTML/XML <intent-filter> element and its attributes. |
| 33 | <code>                &lt;action android:name="android.intent.action.VIEW" /&gt;</code> | 定义或配置 HTML/XML 元素 <action> 及其属性。 | Defines or configures the HTML/XML <action> element and its attributes. |
| 34 | <code>                &lt;category android:name="android.intent.category.DEFAULT" /&gt;</code> | 定义或配置 HTML/XML 元素 <category> 及其属性。 | Defines or configures the HTML/XML <category> element and its attributes. |
| 35 | <code>                &lt;category android:name="android.intent.category.BROWSABLE" /&gt;</code> | 定义或配置 HTML/XML 元素 <category> 及其属性。 | Defines or configures the HTML/XML <category> element and its attributes. |
| 36 | <code>                &lt;data android:scheme="content" android:mimeType="application/vnd.jnote+zip" /&gt;</code> | 定义或配置 HTML/XML 元素 <data> 及其属性。 | Defines or configures the HTML/XML <data> element and its attributes. |
| 37 | <code>                &lt;data android:scheme="content" android:mimeType="application/vnd.jet-note+zip" /&gt;</code> | 定义或配置 HTML/XML 元素 <data> 及其属性。 | Defines or configures the HTML/XML <data> element and its attributes. |
| 38 | <code>            &lt;/intent-filter&gt;</code> | 关闭前面打开的 HTML/XML 元素。 | Closes a previously opened HTML/XML element. |
| 39 | <code>        &lt;/activity&gt;</code> | 关闭前面打开的 HTML/XML 元素。 | Closes a previously opened HTML/XML element. |
| 40 | <code>    &lt;/application&gt;</code> | 关闭前面打开的 HTML/XML 元素。 | Closes a previously opened HTML/XML element. |
| 41 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 42 | <code>&lt;/manifest&gt;</code> | 关闭前面打开的 HTML/XML 元素。 | Closes a previously opened HTML/XML element. |
