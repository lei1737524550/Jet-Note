# assets/css/layout.css — 双语逐行备注 / Bilingual line notes

原文件保持不变，以下备注按原文件行号对应。JSON 和第三方压缩库不插入行内注释，以避免破坏解析或依赖完整性。

The source file remains unchanged. These notes map to its original line numbers. JSON and minified third-party libraries receive sidecar notes so parsing and dependency integrity stay intact.

| 行 / Line | 原始内容 / Source | 中文备注 | English note |
| ---: | --- | --- | --- |
| 1 | <code>/* Shared visual tokens apply to both timeline and journal at actual CSS size. */</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 2 | <code>.text-content{ font-size:var(--body-size); line-height:var(--body-leading); letter-spacing:.1px; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 3 | <code>.more{ position:absolute; top:0; right:0; width:44px; height:44px; padding:10px; display:flex; align-items:center; justify-content:center; border:0; border-radius:10px; background:transparent; font-size:0; line-height:1; letter-spacing:0; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 4 | <code>.more svg{ display:block; width:24px; height:24px; fill:currentColor; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 5 | <code>/* Every full-screen route reserves its own safe content area. */</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 6 | <code>.settings-screen,.post-compose-screen,.crop-screen { height:var(--viewport-height,100dvh); padding-left:var(--safe-left); padding-right:var(--safe-right); }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 7 | <code>.settings-header,.post-compose-header { top:var(--safe-top); }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 8 | <code>.settings-body { top:calc(var(--safe-top) + 64px); bottom:var(--content-bottom,var(--safe-bottom)); }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 9 | <code>.post-compose-body { top:calc(var(--safe-top) + var(--jet-toolbar-height)); bottom:var(--content-bottom,var(--safe-bottom)); }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 10 | <code>.settings-screen::before,.post-compose-screen::before { content:''; position:absolute; top:0; left:0; right:0; height:var(--safe-top); background:white; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 11 | <code>#postComposerText{ font-size:var(--body-size); line-height:var(--body-leading); }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 12 | <code>.image-viewer-close { top:calc(var(--safe-top) + 8px); }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 13 | <code>/* Canvas coordinates are independent of CSS display size. */</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 14 | <code>.crop-screen { position:fixed; inset:0; width:100%; z-index:40000; padding-top:var(--safe-top); padding-bottom:var(--content-bottom,var(--safe-bottom)); }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 15 | <code>.crop-screen.open { display:flex; flex-direction:column; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 16 | <code>.crop-header { position:relative; flex:0 0 56px; height:56px; font-size:18px; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 17 | <code>.crop-back { top:0; height:56px; width:50px; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 18 | <code>.crop-body { position:relative; top:auto; bottom:auto; flex:1; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; padding:8px 14px; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 19 | <code>#cropCanvas { position:relative; width:auto; height:auto; max-width:100%; max-height:calc(100% - 90px); aspect-ratio:631/690; object-fit:contain; touch-action:none; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 20 | <code>.crop-hint { position:static; flex-shrink:0; font-size:13px; margin:12px 0; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 21 | <code>.zoom-row { position:static; flex-shrink:0; width:min(85%,400px); height:30px; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 22 | <code>.crop-footer { position:relative; bottom:auto; flex:0 0 64px; height:64px; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 23 | <code>.crop-cancel,.crop-done { font-size:17px; height:44px; top:10px; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 24 | <code>.crop-done { width:84px; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 25 | <code>@media(max-width:350px) { .name {font-size:18px;} .avatar {width:56px;height:56px;} .profile {gap:8px;} }</code> | 定义 CSS 的全局规则、媒体条件或关键帧。 | Defines a global CSS rule, media condition, or keyframe. |
| 26 | <code>.crop-body { width:100%; height:auto; left:auto; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 27 | <code>#cropCanvas { left:auto; top:auto; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
| 28 | <code>.crop-footer { top:auto; width:100%; }</code> | 组成当前 CSS 样式规则的选择器、属性或格式片段。 | Forms a selector, property, or formatting fragment of the current CSS rule. |
