# assets/js/components/media.js — 双语逐行备注 / Bilingual line notes

原文件保持不变，以下备注按原文件行号对应。JSON 和第三方压缩库不插入行内注释，以避免破坏解析或依赖完整性。

The source file remains unchanged. These notes map to its original line numbers. JSON and minified third-party libraries receive sidecar notes so parsing and dependency integrity stay intact.

| 行 / Line | 原始内容 / Source | 中文备注 | English note |
| ---: | --- | --- | --- |
| 1 | <code>const MAX_MEDIA_IMAGES = 9;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 2 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 3 | <code>function compressImageFile(file, maxSide = 1280, quality = 0.82) {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 4 | <code>  return new Promise((resolve, reject) =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 5 | <code>    if (!file &#124;&#124; !file.type &#124;&#124; !file.type.startsWith('image/')) {</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 6 | <code>      reject(new Error('not-image'));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 7 | <code>      return;</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 8 | <code>    }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 9 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 10 | <code>    const reader = new FileReader();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 11 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 12 | <code>    reader.onerror = () =&gt; reject(new Error('read-failed'));</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 13 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 14 | <code>    reader.onload = () =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 15 | <code>      const img = new Image();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 16 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 17 | <code>      img.onerror = () =&gt; reject(new Error('decode-failed'));</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 18 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 19 | <code>      img.onload = () =&gt; {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 20 | <code>        let width = img.naturalWidth &#124;&#124; img.width;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 21 | <code>        let height = img.naturalHeight &#124;&#124; img.height;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 22 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 23 | <code>        const scale = Math.min(1, maxSide / Math.max(width, height));</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 24 | <code>        width = Math.max(1, Math.round(width * scale));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 25 | <code>        height = Math.max(1, Math.round(height * scale));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 26 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 27 | <code>        const canvas = document.createElement('canvas');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 28 | <code>        canvas.width = width;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 29 | <code>        canvas.height = height;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 30 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 31 | <code>        const c = canvas.getContext('2d');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 32 | <code>        c.drawImage(img, 0, 0, width, height);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 33 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 34 | <code>        // JPEG dramatically reduces localStorage usage for screenshots/photos.</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 35 | <code>        resolve(canvas.toDataURL('image/jpeg', quality));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 36 | <code>      };</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 37 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 38 | <code>      img.src = reader.result;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 39 | <code>    };</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 40 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 41 | <code>    reader.readAsDataURL(file);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 42 | <code>  });</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 43 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 44 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 45 | <code>async function filesToCompressedImages(fileList, remainingSlots) {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 46 | <code>  const files = Array.from(fileList &#124;&#124; []).slice(0, Math.max(0, remainingSlots));</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 47 | <code>  const results = [];</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 48 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 49 | <code>  for (const file of files) {</code> | 开始循环，重复处理集合、次数或条件。 | Starts a loop that repeatedly processes a collection, count, or condition. |
| 50 | <code>    try {</code> | 开始可能失败的 JavaScript 操作。 | Starts a JavaScript operation that may fail. |
| 51 | <code>      results.push(await compressImageFile(file));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 52 | <code>    } catch (e) {</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 53 | <code>      alert(t('imageReadFailed'));</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 54 | <code>    }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 55 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 56 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 57 | <code>  return results;</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 58 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 59 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 60 | <code>function mediaGridClass(images) {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 61 | <code>  const count = (images &#124;&#124; []).length;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 62 | <code>  if (count &lt;= 1) return 'one';</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 63 | <code>  if (count === 2) return 'two';</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 64 | <code>  return 'many';</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 65 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 66 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 67 | <code>function renderMediaHTML(images, className, zoomable = false) {</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 68 | <code>  const safe = Array.isArray(images) ? images : [];</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 69 | <code>  if (!safe.length) return '';</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 70 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 71 | <code>  return `</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 72 | <code>    &lt;div class="${className} ${mediaGridClass(safe)}"&gt;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 73 | <code>      ${safe.map(src =&gt; `</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 74 | <code>        &lt;img src="${src}"</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 75 | <code>             alt=""</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 76 | <code>             ${zoomable ? `onclick="openImageViewer(this.src)"` : ''}&gt;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 77 | <code>      `).join('')}</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 78 | <code>    &lt;/div&gt;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 79 | <code>  `;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 80 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 81 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 82 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 83 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 84 | <code>/* =========================================================</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 85 | <code>   全屏图片查看</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 86 | <code>   ========================================================= */</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
