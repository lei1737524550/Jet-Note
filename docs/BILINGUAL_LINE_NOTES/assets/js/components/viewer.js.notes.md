# assets/js/components/viewer.js — 双语逐行备注 / Bilingual line notes

原文件保持不变，以下备注按原文件行号对应。JSON 和第三方压缩库不插入行内注释，以避免破坏解析或依赖完整性。

The source file remains unchanged. These notes map to its original line numbers. JSON and minified third-party libraries receive sidecar notes so parsing and dependency integrity stay intact.

| 行 / Line | 原始内容 / Source | 中文备注 | English note |
| ---: | --- | --- | --- |
| 1 | <code>const IMAGE_VIEWER_MAX_ZOOM = 4;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 2 | <code>let imageViewerZoom = 1;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 3 | <code>let imageViewerOffsetX = 0;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 4 | <code>let imageViewerOffsetY = 0;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 5 | <code>let imageViewerDragPoint = null;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 6 | <code>let imageViewerPinchDistance = 0;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 7 | <code>let imageViewerPinchZoom = 1;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 8 | <code>const imageViewerPointers = new Map();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 9 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 10 | <code>function resetImageViewerTransform() {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 11 | <code>  imageViewerZoom = 1;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 12 | <code>  imageViewerOffsetX = 0;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 13 | <code>  imageViewerOffsetY = 0;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 14 | <code>  imageViewerDragPoint = null;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 15 | <code>  imageViewerPinchDistance = 0;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 16 | <code>  imageViewerPointers.clear();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 17 | <code>  applyImageViewerTransform();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 18 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 19 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 20 | <code>function clampImageViewerOffsets() {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 21 | <code>  const media = activeViewerMedia();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 22 | <code>  if (!media) return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 23 | <code>  const maxX = Math.max(0, (media.offsetWidth * imageViewerZoom - window.innerWidth) / 2);</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 24 | <code>  const maxY = Math.max(0, (media.offsetHeight * imageViewerZoom - window.innerHeight) / 2);</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 25 | <code>  imageViewerOffsetX = Math.max(-maxX, Math.min(maxX, imageViewerOffsetX));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 26 | <code>  imageViewerOffsetY = Math.max(-maxY, Math.min(maxY, imageViewerOffsetY));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 27 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 28 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 29 | <code>function activeViewerMedia() {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 30 | <code>  const video = document.getElementById('imageViewerVideo');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 31 | <code>  if (video &amp;&amp; video.classList.contains('active')) return video;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 32 | <code>  return document.getElementById('imageViewerImg');</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 33 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 34 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 35 | <code>function applyImageViewerTransform() {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 36 | <code>  const media = activeViewerMedia();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 37 | <code>  if (!media) return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 38 | <code>  clampImageViewerOffsets();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 39 | <code>  media.style.transform = `translate3d(${imageViewerOffsetX}px, ${imageViewerOffsetY}px, 0) scale(${imageViewerZoom})`;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 40 | <code>  media.classList.toggle('zoomed', imageViewerZoom &gt; 1.01);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 41 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 42 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 43 | <code>function imageViewerPointerDistance() {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 44 | <code>  const points = Array.from(imageViewerPointers.values());</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 45 | <code>  if (points.length &lt; 2) return 0;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 46 | <code>  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 47 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 48 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 49 | <code>function openImageViewer(src) {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 50 | <code>  const viewer = document.getElementById('imageViewer');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 51 | <code>  const image = document.getElementById('imageViewerImg');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 52 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 53 | <code>  if (viewer.parentElement !== document.body) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 54 | <code>    document.body.appendChild(viewer);</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 55 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 56 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 57 | <code>  const video = document.getElementById('imageViewerVideo');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 58 | <code>  video.pause();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 59 | <code>  video.removeAttribute('src');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 60 | <code>  video.classList.remove('active');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 61 | <code>  image.classList.add('active');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 62 | <code>  image.src = src;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 63 | <code>  viewer.classList.add('open');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 64 | <code>  resetImageViewerTransform();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 65 | <code>  document.body.style.overflow = 'hidden';</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 66 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 67 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 68 | <code>function openVideoViewer(src, startTime = 0) {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 69 | <code>  const viewer = document.getElementById('imageViewer');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 70 | <code>  const image = document.getElementById('imageViewerImg');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 71 | <code>  const video = document.getElementById('imageViewerVideo');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 72 | <code>  if (!viewer &#124;&#124; !video &#124;&#124; !src) return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 73 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 74 | <code>  if (viewer.parentElement !== document.body) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 75 | <code>    document.body.appendChild(viewer);</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 76 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 77 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 78 | <code>  image.src = '';</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 79 | <code>  image.classList.remove('active');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 80 | <code>  video.classList.add('active');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 81 | <code>  video.src = src;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 82 | <code>  video.setAttribute('playsinline', '');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 83 | <code>  video.setAttribute('webkit-playsinline', '');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 84 | <code>  video.load();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 85 | <code>  const desiredTime = Number.isFinite(startTime) ? startTime : 0;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 86 | <code>  if (desiredTime &gt; 0) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 87 | <code>    video.addEventListener('loadedmetadata', () =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 88 | <code>      try { video.currentTime = Math.min(desiredTime, Number.isFinite(video.duration) ? video.duration : desiredTime); } catch (_) {}</code> | 开始可能失败的 JavaScript 操作。 | Starts a JavaScript operation that may fail. |
| 89 | <code>    }, {once: true});</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 90 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 91 | <code>  viewer.classList.add('open');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 92 | <code>  resetImageViewerTransform();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 93 | <code>  document.body.style.overflow = 'hidden';</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 94 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 95 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 96 | <code>function closeImageViewer(event) {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 97 | <code>  if (event) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 98 | <code>    event.stopPropagation();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 99 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 100 | <code>    // 点击图片本身时不关闭；点击黑色背景或 × 时关闭。</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 101 | <code>    if (event.target &amp;&amp; (event.target.id === 'imageViewerImg' &#124;&#124; event.target.id === 'imageViewerVideo')) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 102 | <code>      return;</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 103 | <code>    }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 104 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 105 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 106 | <code>  const viewer = document.getElementById('imageViewer');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 107 | <code>  viewer.classList.remove('open');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 108 | <code>  resetImageViewerTransform();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 109 | <code>  const image = document.getElementById('imageViewerImg');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 110 | <code>  const video = document.getElementById('imageViewerVideo');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 111 | <code>  image.src = '';</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 112 | <code>  image.classList.remove('active');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 113 | <code>  video.pause();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 114 | <code>  video.removeAttribute('src');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 115 | <code>  video.load();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 116 | <code>  video.classList.remove('active');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 117 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 118 | <code>  const anyOverlay =</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 119 | <code>    document.getElementById('postComposeScreen')?.classList.contains('open') &#124;&#124;</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 120 | <code>    document.getElementById('settingsScreen')?.classList.contains('open');</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 121 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 122 | <code>  if (!anyOverlay) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 123 | <code>    document.body.style.overflow = '';</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 124 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 125 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 126 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 127 | <code>(() =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 128 | <code>  const viewer = document.getElementById('imageViewer');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 129 | <code>  const image = document.getElementById('imageViewerImg');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 130 | <code>  const video = document.getElementById('imageViewerVideo');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 131 | <code>  if (!viewer &#124;&#124; !image &#124;&#124; !video) return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 132 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 133 | <code>  viewer.addEventListener('pointerdown', event =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 134 | <code>    if (!viewer.classList.contains('open') &#124;&#124; event.target === viewer &#124;&#124; event.target.closest('.image-viewer-close')) return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 135 | <code>    if (event.target.closest('video') &amp;&amp; event.pointerType === 'mouse') return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 136 | <code>    imageViewerPointers.set(event.pointerId, {x: event.clientX, y: event.clientY});</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 137 | <code>    viewer.setPointerCapture?.(event.pointerId);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 138 | <code>    if (imageViewerPointers.size === 1) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 139 | <code>      imageViewerDragPoint = {x: event.clientX, y: event.clientY};</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 140 | <code>    } else if (imageViewerPointers.size === 2) {</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 141 | <code>      imageViewerDragPoint = null;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 142 | <code>      imageViewerPinchDistance = imageViewerPointerDistance();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 143 | <code>      imageViewerPinchZoom = imageViewerZoom;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 144 | <code>    }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 145 | <code>  });</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 146 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 147 | <code>  viewer.addEventListener('pointermove', event =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 148 | <code>    if (!imageViewerPointers.has(event.pointerId)) return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 149 | <code>    event.preventDefault();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 150 | <code>    imageViewerPointers.set(event.pointerId, {x: event.clientX, y: event.clientY});</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 151 | <code>    if (imageViewerPointers.size &gt;= 2) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 152 | <code>      event.preventDefault();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 153 | <code>      const distance = imageViewerPointerDistance();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 154 | <code>      if (imageViewerPinchDistance &gt; 0) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 155 | <code>        imageViewerZoom = Math.max(1, Math.min(IMAGE_VIEWER_MAX_ZOOM, imageViewerPinchZoom * distance / imageViewerPinchDistance));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 156 | <code>        applyImageViewerTransform();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 157 | <code>      }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 158 | <code>      return;</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 159 | <code>    }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 160 | <code>    if (imageViewerDragPoint &amp;&amp; imageViewerZoom &gt; 1) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 161 | <code>      event.preventDefault();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 162 | <code>      imageViewerOffsetX += event.clientX - imageViewerDragPoint.x;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 163 | <code>      imageViewerOffsetY += event.clientY - imageViewerDragPoint.y;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 164 | <code>      imageViewerDragPoint = {x: event.clientX, y: event.clientY};</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 165 | <code>      applyImageViewerTransform();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 166 | <code>    }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 167 | <code>  });</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 168 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 169 | <code>  const releasePointer = event =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 170 | <code>    imageViewerPointers.delete(event.pointerId);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 171 | <code>    if (imageViewerPointers.size === 1) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 172 | <code>      imageViewerDragPoint = Array.from(imageViewerPointers.values())[0];</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 173 | <code>    } else {</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 174 | <code>      imageViewerDragPoint = null;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 175 | <code>      imageViewerPinchDistance = 0;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 176 | <code>    }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 177 | <code>  };</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 178 | <code>  viewer.addEventListener('pointerup', releasePointer);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 179 | <code>  viewer.addEventListener('pointercancel', releasePointer);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 180 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 181 | <code>  const toggleDoubleZoom = event =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 182 | <code>    event.preventDefault();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 183 | <code>    imageViewerZoom = imageViewerZoom &gt; 1 ? 1 : 2;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 184 | <code>    if (imageViewerZoom === 1) { imageViewerOffsetX = 0; imageViewerOffsetY = 0; }</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 185 | <code>    applyImageViewerTransform();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 186 | <code>  };</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 187 | <code>  image.addEventListener('dblclick', toggleDoubleZoom);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 188 | <code>  video.addEventListener('dblclick', toggleDoubleZoom);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 189 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 190 | <code>  viewer.addEventListener('wheel', event =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 191 | <code>    if (!viewer.classList.contains('open')) return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 192 | <code>    event.preventDefault();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 193 | <code>    imageViewerZoom = Math.max(1, Math.min(IMAGE_VIEWER_MAX_ZOOM, imageViewerZoom * (event.deltaY &lt; 0 ? 1.12 : .89)));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 194 | <code>    if (imageViewerZoom === 1) { imageViewerOffsetX = 0; imageViewerOffsetY = 0; }</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 195 | <code>    applyImageViewerTransform();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 196 | <code>  }, {passive: false});</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 197 | <code>})();</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 198 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 199 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 200 | <code>/* =========================================================</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 201 | <code>   图片查看功能</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 202 | <code>   ========================================================= */</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
