# assets/js/components/crop.js — 双语逐行备注 / Bilingual line notes

原文件保持不变，以下备注按原文件行号对应。JSON 和第三方压缩库不插入行内注释，以避免破坏解析或依赖完整性。

The source file remains unchanged. These notes map to its original line numbers. JSON and minified third-party libraries receive sidecar notes so parsing and dependency integrity stay intact.

| 行 / Line | 原始内容 / Source | 中文备注 | English note |
| ---: | --- | --- | --- |
| 1 | <code>const picker = document.getElementById('avatarPicker');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 2 | <code>const cropScreen = document.getElementById('cropScreen');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 3 | <code>const cropCanvas = document.getElementById('cropCanvas');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 4 | <code>const ctx = cropCanvas.getContext('2d');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 5 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 6 | <code>const CROP_CX = cropCanvas.width / 2;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 7 | <code>const CROP_CY = 340;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 8 | <code>const CROP_R = 255;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 9 | <code>const CROP_SIZE = CROP_R * 2;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 10 | <code>let cropShape = 'circle';</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 11 | <code>let cropWidth = CROP_SIZE;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 12 | <code>let cropHeight = CROP_SIZE;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 13 | <code>let cropMaxSide = 512;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 14 | <code>let cropPicker = picker;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 15 | <code>let cropSave = null;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 16 | <code>let cropGeneration = 0;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 17 | <code>let cropSaving = false;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 18 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 19 | <code>let cropImage = null;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 20 | <code>let baseScale = 1;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 21 | <code>let zoom = 1;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 22 | <code>let offsetX = 0;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 23 | <code>let offsetY = 0;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 24 | <code>let dragging = false;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 25 | <code>let lastX = 0;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 26 | <code>let lastY = 0;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 27 | <code>let pointers = new Map();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 28 | <code>let pinchStartDist = 0;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 29 | <code>let pinchStartZoom = 1;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 30 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 31 | <code>function changeAvatar() {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 32 | <code>  if (!isWorkspaceWritable()) return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 33 | <code>  picker.click();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 34 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 35 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 36 | <code>function handleAvatarFile(event) {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 37 | <code>  if (!isWorkspaceWritable()) { event.target.value = ''; return; }</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 38 | <code>  const file = event.target.files &amp;&amp; event.target.files[0];</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 39 | <code>  event.target.value = '';</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 40 | <code>  if (file) openAvatarCrop(file, async result =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 41 | <code>    // Commit before updating the visible profile, so a failed write preserves it.</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 42 | <code>    AppStorage.setItem(PROFILE_AVATAR_KEY, result);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 43 | <code>    document.getElementById('mainAvatar').src = result;</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 44 | <code>    document.querySelectorAll('.sync-avatar').forEach(img =&gt; img.src = result);</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 45 | <code>    renderPosts();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 46 | <code>  });</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 47 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 48 | <code>function openAvatarCrop(file, onSave) {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 49 | <code>  openImageCrop(file, {</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 50 | <code>    shape: typeof getAvatarShape === 'function' &amp;&amp; getAvatarShape() === 'square' ? 'square' : 'circle',</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 51 | <code>    aspectRatio: 1,</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 52 | <code>    maxSide: 512,</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 53 | <code>    picker</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 54 | <code>  }, onSave);</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 55 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 56 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 57 | <code>function openImageCrop(file, options, onSave) {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 58 | <code>  if (!file.type.startsWith('image/')) { alert(t('imageOnly')); return; }</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 59 | <code>  const config = options &#124;&#124; {};</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 60 | <code>  const aspectRatio = Math.max(.35, Math.min(2.85, Number(config.aspectRatio) &#124;&#124; 1));</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 61 | <code>  const generation = ++cropGeneration;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 62 | <code>  const url = URL.createObjectURL(file);</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 63 | <code>  const img = new Image();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 64 | <code>  img.onload = () =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 65 | <code>    URL.revokeObjectURL(url);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 66 | <code>    if (generation !== cropGeneration) return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 67 | <code>    cropImage = img;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 68 | <code>    cropShape = config.shape === 'circle' ? 'circle' : (config.shape === 'square' ? 'square' : 'rectangle');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 69 | <code>    cropMaxSide = Math.max(256, Math.min(2560, Number(config.maxSide) &#124;&#124; 512));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 70 | <code>    cropPicker = config.picker &#124;&#124; null;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 71 | <code>    cropSave = onSave;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 72 | <code>    cropWidth = Math.min(CROP_SIZE, 590 * aspectRatio);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 73 | <code>    cropHeight = cropWidth / aspectRatio;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 74 | <code>    baseScale = Math.max(cropWidth / img.naturalWidth, cropHeight / img.naturalHeight);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 75 | <code>    zoom = 1; offsetX = 0; offsetY = 0; pointers.clear(); dragging = false;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 76 | <code>    document.getElementById('zoomRange').value = 1;</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 77 | <code>    document.body.appendChild(cropScreen);</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 78 | <code>    cropScreen.classList.add('open');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 79 | <code>    document.body.style.overflow = 'hidden';</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 80 | <code>    drawCrop();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 81 | <code>  };</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 82 | <code>  img.onerror = () =&gt; { URL.revokeObjectURL(url); alert(t('imageLoadFailed')); };</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 83 | <code>  img.src = url;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 84 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 85 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 86 | <code>function closeCrop() {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 87 | <code>  if (cropSaving) return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 88 | <code>  ++cropGeneration;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 89 | <code>  cropScreen.classList.remove('open');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 90 | <code>  cropImage = null; cropSave = null;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 91 | <code>  document.body.style.overflow = document.querySelector('.settings-screen.open') ? 'hidden' : '';</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 92 | <code>  if (cropPicker) cropPicker.value = '';</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 93 | <code>  cropPicker = null;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 94 | <code>  pointers.clear();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 95 | <code>  dragging = false;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 96 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 97 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 98 | <code>function clampOffsets() {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 99 | <code>  if (!cropImage) return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 100 | <code>  const s = baseScale * zoom;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 101 | <code>  const dw = cropImage.naturalWidth * s;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 102 | <code>  const dh = cropImage.naturalHeight * s;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 103 | <code>  const maxX = Math.max(0, dw / 2 - cropWidth / 2);</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 104 | <code>  const maxY = Math.max(0, dh / 2 - cropHeight / 2);</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 105 | <code>  offsetX = Math.max(-maxX, Math.min(maxX, offsetX));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 106 | <code>  offsetY = Math.max(-maxY, Math.min(maxY, offsetY));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 107 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 108 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 109 | <code>function drawCrop() {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 110 | <code>  if (!cropImage) return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 111 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 112 | <code>  clampOffsets();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 113 | <code>  ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 114 | <code>  ctx.fillStyle = '#000';</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 115 | <code>  ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 116 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 117 | <code>  const s = baseScale * zoom;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 118 | <code>  const dw = cropImage.naturalWidth * s;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 119 | <code>  const dh = cropImage.naturalHeight * s;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 120 | <code>  const dx = CROP_CX - dw / 2 + offsetX;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 121 | <code>  const dy = CROP_CY - dh / 2 + offsetY;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 122 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 123 | <code>  ctx.drawImage(cropImage, dx, dy, dw, dh);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 124 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 125 | <code>  // Dim everything outside the active circle/square/background crop area.</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 126 | <code>  ctx.save();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 127 | <code>  ctx.fillStyle = 'rgba(0,0,0,.48)';</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 128 | <code>  ctx.beginPath();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 129 | <code>  ctx.rect(0, 0, cropCanvas.width, cropCanvas.height);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 130 | <code>  if (cropShape === 'circle') ctx.arc(CROP_CX, CROP_CY, cropWidth / 2, 0, Math.PI * 2, true);</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 131 | <code>  else ctx.rect(CROP_CX - cropWidth / 2, CROP_CY - cropHeight / 2, cropWidth, cropHeight);</code> | 处理前一个 JavaScript 条件不满足时的分支。 | Handles the branch used when the preceding JavaScript condition is not met. |
| 132 | <code>  ctx.fill('evenodd');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 133 | <code>  ctx.restore();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 134 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 135 | <code>  // Draw the visible crop boundary using the selected avatar/background shape.</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 136 | <code>  ctx.save();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 137 | <code>  ctx.beginPath();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 138 | <code>  if (cropShape === 'circle') ctx.arc(CROP_CX, CROP_CY, cropWidth / 2, 0, Math.PI * 2);</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 139 | <code>  else ctx.rect(CROP_CX - cropWidth / 2, CROP_CY - cropHeight / 2, cropWidth, cropHeight);</code> | 处理前一个 JavaScript 条件不满足时的分支。 | Handles the branch used when the preceding JavaScript condition is not met. |
| 140 | <code>  ctx.strokeStyle = 'rgba(255,255,255,.96)';</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 141 | <code>  ctx.lineWidth = 2;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 142 | <code>  ctx.stroke();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 143 | <code>  ctx.restore();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 144 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 145 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 146 | <code>function setZoom(v) {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 147 | <code>  zoom = Number(v);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 148 | <code>  clampOffsets();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 149 | <code>  drawCrop();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 150 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 151 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 152 | <code>function canvasPoint(ev) {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 153 | <code>  const r = cropCanvas.getBoundingClientRect();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 154 | <code>  return {</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 155 | <code>    x: (ev.clientX - r.left) * cropCanvas.width / r.width,</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 156 | <code>    y: (ev.clientY - r.top) * cropCanvas.height / r.height</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 157 | <code>  };</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 158 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 159 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 160 | <code>function pointerDistance() {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 161 | <code>  const pts = [...pointers.values()];</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 162 | <code>  if (pts.length &lt; 2) return 0;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 163 | <code>  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 164 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 165 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 166 | <code>cropCanvas.addEventListener('pointerdown', ev =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 167 | <code>  cropCanvas.setPointerCapture(ev.pointerId);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 168 | <code>  const p = canvasPoint(ev);</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 169 | <code>  pointers.set(ev.pointerId, p);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 170 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 171 | <code>  if (pointers.size === 1) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 172 | <code>    dragging = true;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 173 | <code>    lastX = p.x;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 174 | <code>    lastY = p.y;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 175 | <code>  } else if (pointers.size === 2) {</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 176 | <code>    dragging = false;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 177 | <code>    pinchStartDist = pointerDistance();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 178 | <code>    pinchStartZoom = zoom;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 179 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 180 | <code>});</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 181 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 182 | <code>cropCanvas.addEventListener('pointermove', ev =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 183 | <code>  if (!pointers.has(ev.pointerId)) return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 184 | <code>  const p = canvasPoint(ev);</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 185 | <code>  pointers.set(ev.pointerId, p);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 186 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 187 | <code>  if (pointers.size === 2) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 188 | <code>    const d = pointerDistance();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 189 | <code>    if (pinchStartDist &gt; 0) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 190 | <code>      zoom = Math.max(1, Math.min(4, pinchStartZoom * d / pinchStartDist));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 191 | <code>      document.getElementById('zoomRange').value = zoom;</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 192 | <code>      drawCrop();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 193 | <code>    }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 194 | <code>    return;</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 195 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 196 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 197 | <code>  if (dragging &amp;&amp; pointers.size === 1) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 198 | <code>    offsetX += p.x - lastX;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 199 | <code>    offsetY += p.y - lastY;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 200 | <code>    lastX = p.x;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 201 | <code>    lastY = p.y;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 202 | <code>    drawCrop();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 203 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 204 | <code>});</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 205 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 206 | <code>function releasePointer(ev) {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 207 | <code>  pointers.delete(ev.pointerId);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 208 | <code>  if (pointers.size === 1) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 209 | <code>    const p = [...pointers.values()][0];</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 210 | <code>    dragging = true;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 211 | <code>    lastX = p.x;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 212 | <code>    lastY = p.y;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 213 | <code>  } else {</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 214 | <code>    dragging = false;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 215 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 216 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 217 | <code>cropCanvas.addEventListener('pointerup', releasePointer);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 218 | <code>cropCanvas.addEventListener('pointercancel', releasePointer);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 219 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 220 | <code>cropCanvas.addEventListener('wheel', ev =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 221 | <code>  ev.preventDefault();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 222 | <code>  zoom = Math.max(1, Math.min(4, zoom * (ev.deltaY &lt; 0 ? 1.06 : 0.94)));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 223 | <code>  document.getElementById('zoomRange').value = zoom;</code> | 读取、创建或更新页面中的 DOM 元素。 | Reads, creates, or updates a DOM element in the page. |
| 224 | <code>  drawCrop();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 225 | <code>}, {passive:false});</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 226 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 227 | <code>async function finishCrop() {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 228 | <code>  if (!cropImage &#124;&#124; cropSaving) return;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 229 | <code>  clampOffsets();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 230 | <code>  cropSaving = true;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 231 | <code>  const button = cropScreen.querySelector('.crop-done');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 232 | <code>  button.disabled = true;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 233 | <code>  try {</code> | 开始可能失败的 JavaScript 操作。 | Starts a JavaScript operation that may fail. |
| 234 | <code>    const out = document.createElement('canvas');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 235 | <code>    const ratio = cropWidth / cropHeight;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 236 | <code>    out.width = Math.round(ratio &gt;= 1 ? cropMaxSide : cropMaxSide * ratio);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 237 | <code>    out.height = Math.round(ratio &gt;= 1 ? cropMaxSide / ratio : cropMaxSide);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 238 | <code>    const scale = baseScale * zoom;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 239 | <code>    const dx = CROP_CX - cropImage.naturalWidth * scale / 2 + offsetX;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 240 | <code>    const dy = CROP_CY - cropImage.naturalHeight * scale / 2 + offsetY;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 241 | <code>    out.getContext('2d').drawImage(cropImage,</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 242 | <code>      (CROP_CX - cropWidth/2 - dx)/scale, (CROP_CY - cropHeight/2 - dy)/scale,</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 243 | <code>      cropWidth/scale, cropHeight/scale, 0, 0, out.width, out.height);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 244 | <code>    await cropSave(out.toDataURL('image/jpeg', .88));</code> | 等待异步操作完成后再继续执行。 | Waits for an asynchronous operation to finish before continuing. |
| 245 | <code>    cropSaving = false;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 246 | <code>    closeCrop();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 247 | <code>  } catch (error) {</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 248 | <code>    console.error('Crop save failed', error);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 249 | <code>    alert(t('storageFull'));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 250 | <code>  } finally {</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 251 | <code>    cropSaving = false; button.disabled = false;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 252 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 253 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
