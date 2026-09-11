# assets/js/components/notice.js — 双语逐行备注 / Bilingual line notes

原文件保持不变，以下备注按原文件行号对应。JSON 和第三方压缩库不插入行内注释，以避免破坏解析或依赖完整性。

The source file remains unchanged. These notes map to its original line numbers. JSON and minified third-party libraries receive sidecar notes so parsing and dependency integrity stay intact.

| 行 / Line | 原始内容 / Source | 中文备注 | English note |
| ---: | --- | --- | --- |
| 1 | <code>/* All page alert() calls use the Jet Note visual language. */</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 2 | <code>const JetNoteNotice=(()=&gt;{</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 3 | <code>  let queue=[],open=false;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 4 | <code>  const root=document.createElement('div'); root.className='jet-notice-backdrop'; root.innerHTML=`&lt;section class="jet-notice" role="alertdialog" aria-modal="true" aria-labelledby="jetNoticeTitle"&gt;&lt;div class="jet-notice-mark"&gt;i&lt;/div&gt;&lt;h2 id=" … [truncated; 388 characters in source]</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 5 | <code>  const message=root.querySelector('#jetNoticeMessage'),title=root.querySelector('#jetNoticeTitle'),ok=root.querySelector('#jetNoticeOk');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 6 | <code>  function show(){</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 7 | <code>    if(open&#124;&#124;!queue.length)return; open=true; const item=queue.shift(); title.textContent=typeof t==='function'?t('notice'):'提示'; message.textContent=String(item); root.classList.add('open'); requestAnimationFrame(()=&gt;ok.focus());</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 8 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 9 | <code>  function close(){</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 10 | <code>    if(!open)return; root.classList.remove('open'); open=false; setTimeout(show,100);</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 11 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 12 | <code>  ok.addEventListener('click',close); root.addEventListener('click',event=&gt;{</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 13 | <code>    if(event.target===root)close();</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 14 | <code>  });</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 15 | <code>  document.addEventListener('keydown',event=&gt;{</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 16 | <code>    if(open&amp;&amp;(event.key==='Escape'&#124;&#124;event.key==='Enter')){</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 17 | <code>      event.preventDefault(); close();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 18 | <code>    }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 19 | <code>  });</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 20 | <code>  window.alert=value=&gt;{</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 21 | <code>    queue.push(value??''); show();</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 22 | <code>  };</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 23 | <code>  return{</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 24 | <code>    close,isOpen:()=&gt;open</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 25 | <code>  };</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 26 | <code>})();</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
