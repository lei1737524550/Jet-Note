# assets/js/core/viewport.js — 双语逐行备注 / Bilingual line notes

原文件保持不变，以下备注按原文件行号对应。JSON 和第三方压缩库不插入行内注释，以避免破坏解析或依赖完整性。

The source file remains unchanged. These notes map to its original line numbers. JSON and minified third-party libraries receive sidecar notes so parsing and dependency integrity stay intact.

| 行 / Line | 原始内容 / Source | 中文备注 | English note |
| ---: | --- | --- | --- |
| 1 | <code>/* The document uses CSS layout; this compatibility hook is used by renderers. */</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 2 | <code>let nativeKeyboardHeight = 0;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 3 | <code>function fit() { syncViewport(); }</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 4 | <code>function syncViewport() {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 5 | <code>  const vv = window.visualViewport;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 6 | <code>  const visibleHeight = vv ? vv.height : window.innerHeight;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 7 | <code>  const height = nativeKeyboardHeight &gt; 0 ? Math.min(visibleHeight, nativeKeyboardHeight) : visibleHeight;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 8 | <code>  document.documentElement.style.setProperty('--viewport-height', height + 'px');</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 9 | <code>  const keyboardOpen = nativeKeyboardHeight &gt; 0 &#124;&#124; window.innerHeight - height &gt; 120;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 10 | <code>  document.documentElement.style.setProperty('--content-bottom', keyboardOpen ? '0px' : 'var(--safe-bottom)');</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 11 | <code>  return height;</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 12 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 13 | <code>window.applySystemInsets = function(top, right, bottom, left, keyboardHeight = 0) {</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 14 | <code>  // Native coordinates are physical pixels; CSS pixels use devicePixelRatio.</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 15 | <code>  const ratio = window.devicePixelRatio &#124;&#124; 1;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 16 | <code>  nativeKeyboardHeight = keyboardHeight / ratio;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 17 | <code>  for (const [name, value] of Object.entries({top,right,bottom,left})) {</code> | 开始循环，重复处理集合、次数或条件。 | Starts a loop that repeatedly processes a collection, count, or condition. |
| 18 | <code>    document.documentElement.style.setProperty('--safe-' + name, Math.max(0, value / ratio) + 'px');</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 19 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 20 | <code>  syncViewport();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 21 | <code>  if (typeof syncComposerViewport === 'function') syncComposerViewport();</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 22 | <code>};</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 23 | <code>window.addEventListener('resize', syncViewport);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 24 | <code>if (window.visualViewport) window.visualViewport.addEventListener('resize', syncViewport);</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 25 | <code>syncViewport();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
