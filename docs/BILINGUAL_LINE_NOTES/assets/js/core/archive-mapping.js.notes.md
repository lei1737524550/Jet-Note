# assets/js/core/archive-mapping.js — 双语逐行备注 / Bilingual line notes

原文件保持不变，以下备注按原文件行号对应。JSON 和第三方压缩库不插入行内注释，以避免破坏解析或依赖完整性。

The source file remains unchanged. These notes map to its original line numbers. JSON and minified third-party libraries receive sidecar notes so parsing and dependency integrity stay intact.

| 行 / Line | 原始内容 / Source | 中文备注 | English note |
| ---: | --- | --- | --- |
| 1 | <code>/* Maps internal post records to the post-only .jnote v2 exchange model. */</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 2 | <code>const ArchiveMapping={</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 3 | <code>  async toCanonical(record,resolveMedia,resolveImage){</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 4 | <code>    const attachments=[],byPath=new Map();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 5 | <code>    function add(meta){</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 6 | <code>      const old=byPath.get(meta.path);</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 7 | <code>      if(old){</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 8 | <code>        if(old.sha256!==meta.sha256)throw Error('Conflicting media path');</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 9 | <code>        return old;</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 10 | <code>      }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 11 | <code>      byPath.set(meta.path,meta);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 12 | <code>      attachments.push(meta);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 13 | <code>      return meta;</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 14 | <code>    }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 15 | <code>    for(const meta of record.attachments&#124;&#124;[])add(await resolveMedia(meta));</code> | 开始循环，重复处理集合、次数或条件。 | Starts a loop that repeatedly processes a collection, count, or condition. |
| 16 | <code>    const raw=structuredClone(record);</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 17 | <code>    delete raw.archiveExtra;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 18 | <code>    delete raw.archiveFields;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 19 | <code>    async function imageRef(source){</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 20 | <code>      let meta=attachments.find(x=&gt;x.type==='image'&amp;&amp;NativeMedia.url(x)===source);</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 21 | <code>      if(!meta)meta=add(await resolveImage(source));</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 22 | <code>      return 'jet-note-media:'+meta.id;</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 23 | <code>    }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 24 | <code>    if(Array.isArray(raw.images)){</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 25 | <code>      const refs=[];</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 26 | <code>      for(const source of raw.images)refs.push(await imageRef(source));</code> | 开始循环，重复处理集合、次数或条件。 | Starts a loop that repeatedly processes a collection, count, or condition. |
| 27 | <code>      raw.images=refs;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 28 | <code>    }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 29 | <code>    return {</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 30 | <code>      ...(record.archiveFields&#124;&#124;{</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 31 | <code>      }),id:record.uuid,type:'post',text:record.text&#124;&#124;'',createdAt:record.createdAt??null,updatedAt:record.updatedAt??null,attachments,extra:{</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 32 | <code>        ...(record.archiveExtra&#124;&#124;record.extra&#124;&#124;{</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 33 | <code>        }),jetNoteRecord:raw</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 34 | <code>      }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 35 | <code>    };</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 36 | <code>  },</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 37 | <code>  fromCanonical(list,resolveMedia){</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 38 | <code>    if(!Array.isArray(list)&#124;&#124;list.length&gt;10000)throw Error('Invalid posts array');</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 39 | <code>    const ids=new Set(),media=new Map();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 40 | <code>    let numericId=Date.now();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 41 | <code>    const object=value=&gt;value!==null&amp;&amp;typeof value==='object'&amp;&amp;!Array.isArray(value);</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 42 | <code>    const posts=list.map(entry=&gt;{</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 43 | <code>      if(!object(entry)&#124;&#124;!['string','number'].includes(typeof entry.id)&#124;&#124;!String(entry.id)&#124;&#124;String(entry.id).length&gt;100&#124;&#124;entry.type!=='post'&#124;&#124;typeof entry.text!=='string'&#124;&#124;!Array.isArray(entry.attachments))throw Error('Invalid Post');</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 44 | <code>      const stableId=String(entry.id); if(ids.has(stableId))throw Error('Duplicate Post ID'); ids.add(stableId);</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 45 | <code>      for(const key of ['createdAt','updatedAt'])if(entry[key]!=null&amp;&amp;(typeof entry[key]!=='string'&#124;&#124;!Number.isFinite(Date.parse(entry[key]))))throw Error('Invalid timestamp');</code> | 开始循环，重复处理集合、次数或条件。 | Starts a loop that repeatedly processes a collection, count, or condition. |
| 46 | <code>      const attachments=[],refs=new Map(),paths=new Map(),ownIds=new Set();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 47 | <code>      for(const attachment of entry.attachments){</code> | 开始循环，重复处理集合、次数或条件。 | Starts a loop that repeatedly processes a collection, count, or condition. |
| 48 | <code>        if(!object(attachment)&#124;&#124;typeof attachment.id!=='string'&#124;&#124;!/^[A-Za-z0-9_-]{1,100}$/.test(attachment.id)&#124;&#124;ownIds.has(attachment.id)&#124;&#124;typeof attachment.type!=='string'&#124;&#124;!attachment.type&#124;&#124;typeof attachment.mimeType!=='string'&#124;&#124;!/^[a-z0- … [truncated; 407 characters in source]</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 49 | <code>        if(attachment.type==='image'&amp;&amp;!attachment.mimeType.startsWith('image/'))throw Error('Invalid image MIME');</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 50 | <code>        const stored=resolveMedia(attachment),old=media.get(attachment.id); if(old&amp;&amp;old.sha256!==stored.sha256)throw Error('Conflicting Attachment ID');</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 51 | <code>        ownIds.add(attachment.id); media.set(attachment.id,stored); const{</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 52 | <code>          blob,...meta</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 53 | <code>        }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 54 | <code>        =stored; attachments.push(meta);</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 55 | <code>        if(attachment.type==='image'){</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 56 | <code>          const source=stored.imageSource&#124;&#124;NativeMedia.url(stored); refs.set(attachment.id,source); paths.set('https://appassets.androidplatform.net/'+attachment.path,source); paths.set('https://jetnote.local/'+attachment.path,source);</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 57 | <code>        }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 58 | <code>      }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 59 | <code>      const native=object(entry.extra?.jetNoteRecord); let raw=native?structuredClone(entry.extra.jetNoteRecord):{</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 60 | <code>        text:entry.text,time:entry.createdAt&#124;&#124;'',images:entry.attachments.filter(a=&gt;a.type==='image').map(a=&gt;refs.get(a.id))</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 61 | <code>      };</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 62 | <code>      function ref(value){</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 63 | <code>        if(typeof value!=='string')throw Error('Invalid image reference'); if(value.startsWith('jet-note-media:')){</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 64 | <code>          const source=refs.get(value.slice(15)); if(!source)throw Error('Missing image'); return source;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 65 | <code>        }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 66 | <code>        if(paths.has(value))return paths.get(value); if(/^data:image\//i.test(value))return value; throw Error('Unresolved image');</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 67 | <code>      }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 68 | <code>      if(Array.isArray(raw.images))raw.images=raw.images.map(ref); else raw.images=[];</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 69 | <code>      if(typeof raw.text!=='string'&#124;&#124;raw.images.some(source=&gt;!NativeMedia.isImage(source)))throw Error('Invalid post content');</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 70 | <code>      raw.uuid=stableId; raw.createdAt=entry.createdAt??null; raw.updatedAt=entry.updatedAt??null; raw.time=typeof raw.time==='string'?raw.time:(entry.createdAt&#124;&#124;'');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 71 | <code>      raw.archiveExtra={</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 72 | <code>        ...(entry.extra&#124;&#124;{</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 73 | <code>        })</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 74 | <code>      }; delete raw.archiveExtra.jetNoteRecord;</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 75 | <code>      raw.archiveFields={</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 76 | <code>        ...entry</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 77 | <code>      }; for(const key of ['id','type','text','createdAt','updatedAt','attachments','extra'])delete raw.archiveFields[key];</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 78 | <code>      raw.attachments=attachments.map(item=&gt;{</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 79 | <code>        const copy={</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 80 | <code>          ...item</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 81 | <code>        }; delete copy.imageSource; return copy;</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 82 | <code>      });</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 83 | <code>      if(!Number.isSafeInteger(raw.id)&#124;&#124;raw.id&lt;0){</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 84 | <code>        raw.legacyId=raw.legacyId??raw.id; raw.id=numericId++;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 85 | <code>      }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 86 | <code>      return stableEntry(raw);</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 87 | <code>    });</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 88 | <code>    return{</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 89 | <code>      posts,media:[...media.values()].map(item=&gt;{</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 90 | <code>        const copy={</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 91 | <code>          ...item</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 92 | <code>        }; delete copy.imageSource; return copy;</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 93 | <code>      })</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 94 | <code>    };</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 95 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 96 | <code>};</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
