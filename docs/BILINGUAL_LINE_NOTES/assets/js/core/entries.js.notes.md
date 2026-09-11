# assets/js/core/entries.js — 双语逐行备注 / Bilingual line notes

原文件保持不变，以下备注按原文件行号对应。JSON 和第三方压缩库不插入行内注释，以避免破坏解析或依赖完整性。

The source file remains unchanged. These notes map to its original line numbers. JSON and minified third-party libraries receive sidecar notes so parsing and dependency integrity stay intact.

| 行 / Line | 原始内容 / Source | 中文备注 | English note |
| ---: | --- | --- | --- |
| 1 | <code>/* Post records and attachment metadata share one IndexedDB transaction. */</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 2 | <code>const EntryStore={</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 3 | <code>  db:null,migration:null,</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 4 | <code>  async open(){</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 5 | <code>    if(this.db)return this.db;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 6 | <code>    this.db=await new Promise((resolve,reject)=&gt;{</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 7 | <code>      const databaseName=getCurrentAppMode()==='demo'?'jet_note_entries_demo':'jet_note_entries';</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 8 | <code>      const request=indexedDB.open(databaseName,1);</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 9 | <code>      request.onupgradeneeded=()=&gt;{request.result.createObjectStore('state');request.result.createObjectStore('media',{keyPath:'id'});};</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 10 | <code>      request.onsuccess=()=&gt;resolve(request.result);request.onerror=()=&gt;reject(request.error);request.onblocked=()=&gt;reject(Error('Database upgrade blocked'));</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 11 | <code>    });</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 12 | <code>    this.db.onversionchange=()=&gt;{this.db.close();this.db=null;};return this.db;</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 13 | <code>  },</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 14 | <code>  async read(){</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 15 | <code>    const db=await this.open();return new Promise((resolve,reject)=&gt;{const tx=db.transaction('state');const req=tx.objectStore('state').get('entries');tx.oncomplete=()=&gt;resolve(req.result);tx.onabort=()=&gt;reject(tx.error);});</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 16 | <code>  },</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 17 | <code>  async media(id){</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 18 | <code>    const db=await this.open();return new Promise((resolve,reject)=&gt;{const tx=db.transaction('media');const req=tx.objectStore('media').get(id);tx.oncomplete=()=&gt;resolve(req.result);tx.onabort=()=&gt;reject(tx.error);});</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 19 | <code>  },</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 20 | <code>  async commit(nextPosts,media=[]){</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 21 | <code>    const db=await this.open();return new Promise((resolve,reject)=&gt;{</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 22 | <code>      const tx=db.transaction(['state','media'],'readwrite');tx.oncomplete=resolve;tx.onabort=()=&gt;reject(tx.error&#124;&#124;Error('Transaction aborted'));tx.onerror=()=&gt;{};</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 23 | <code>      try{tx.objectStore('state').put({posts:nextPosts,migration:this.migration},'entries');for(const record of media)tx.objectStore('media').put(record);}catch(error){tx.abort();reject(error);}</code> | 开始可能失败的 JavaScript 操作。 | Starts a JavaScript operation that may fail. |
| 24 | <code>    });</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 25 | <code>  },</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 26 | <code>  async removeUnreferencedMedia(ids){</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 27 | <code>    const db=await this.open();return new Promise((resolve,reject)=&gt;{</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 28 | <code>      const tx=db.transaction('media','readwrite'),store=tx.objectStore('media'),req=store.getAllKeys();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 29 | <code>      req.onsuccess=()=&gt;{for(const id of req.result)if(!ids.has(String(id)))store.delete(id);};</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 30 | <code>      tx.oncomplete=resolve;tx.onabort=()=&gt;reject(tx.error&#124;&#124;Error('Media cleanup aborted'));tx.onerror=()=&gt;{};</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 31 | <code>    });</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 32 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 33 | <code>};</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 34 | <code>let entriesReady=false,entriesBusy=false;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 35 | <code>function entryUuid(){</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 36 | <code>  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&amp;15)&#124;64;bytes[8]=(bytes[8]&amp;63)&#124;128;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 37 | <code>  const hex=Array.from(bytes,b=&gt;b.toString(16).padStart(2,'0')).join('');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 38 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 39 | <code>function stableEntry(record){</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 40 | <code>  const result={...record};</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 41 | <code>  if(!result.uuid)result.uuid=typeof result.id==='string'?result.id:entryUuid();</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 42 | <code>  if(!Number.isSafeInteger(result.id)){result.legacyId=result.legacyId??result.id;result.id=Date.now()+stableEntry.sequence++;}</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 43 | <code>  if(result.attachments?.some(a=&gt;a.type==='image'))result.images=[...new Set([...(result.images&#124;&#124;[]),...result.attachments.filter(a=&gt;a.type==='image').map(a=&gt;NativeMedia.url(a)).filter(Boolean)])];</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 44 | <code>  if(!('createdAt' in result))result.createdAt=Number.isSafeInteger(record.id)&amp;&amp;record.id&gt;946684800000&amp;&amp;record.id&lt;4102444800000?new Date(record.id).toISOString():null;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 45 | <code>  if(!('updatedAt' in result))result.updatedAt=null;</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 46 | <code>  if(!Array.isArray(result.attachments))result.attachments=[];</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 47 | <code>  delete result.type;delete result.title;delete result.bodyHtml;delete result.content;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 48 | <code>  return result;</code> | 从当前函数返回值，或立即结束函数。 | Returns a value from, or immediately ends, the current function. |
| 49 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 50 | <code>stableEntry.sequence=0;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 51 | <code>function nextEntryId(){return Math.max(Date.now(),...posts.map(p=&gt;Number.isSafeInteger(p.id)?p.id+1:0));}</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 52 | <code>async function initializeEntries(){</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 53 | <code>  let state=await EntryStore.read();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 54 | <code>  const localPosts=posts.map(stableEntry);</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 55 | <code>  EntryStore.migration=state?.migration&#124;&#124;null;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 56 | <code>  let nextPosts=Array.isArray(state?.posts)?state.posts.map(stableEntry):localPosts;</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 57 | <code>  if(!EntryStore.migration?.postsOnly){</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 58 | <code>    const byUuid=new Map(nextPosts.map((item,index)=&gt;[item.uuid,index]));</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 59 | <code>    for(const raw of localPosts){</code> | 开始循环，重复处理集合、次数或条件。 | Starts a loop that repeatedly processes a collection, count, or condition. |
| 60 | <code>      let index=byUuid.get(raw.uuid);</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 61 | <code>      if(index===undefined&amp;&amp;Number.isSafeInteger(raw.id))index=nextPosts.findIndex(item=&gt;item.id===raw.id&#124;&#124;item.legacyId===raw.id);</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 62 | <code>      if(index&lt;0&#124;&#124;index===undefined){byUuid.set(raw.uuid,nextPosts.length);nextPosts.push(raw);}</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 63 | <code>      else if(Date.parse(raw.updatedAt)&gt;(Date.parse(nextPosts[index].updatedAt)&#124;&#124;0))nextPosts[index]={...raw,id:nextPosts[index].id,uuid:nextPosts[index].uuid};</code> | 处理前一个 JavaScript 条件不满足时的分支。 | Handles the branch used when the preceding JavaScript condition is not met. |
| 64 | <code>    }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 65 | <code>    const used=new Set();let next=Date.now();</code> | 声明一个 JavaScript 变量、常量或引用。 | Declares a JavaScript variable, constant, or reference. |
| 66 | <code>    for(const item of nextPosts){if(!Number.isSafeInteger(item.id)&#124;&#124;used.has(item.id)){item.legacyId=item.legacyId??item.id;while(used.has(next))next++;item.id=next++;}used.add(item.id);}</code> | 开始循环，重复处理集合、次数或条件。 | Starts a loop that repeatedly processes a collection, count, or condition. |
| 67 | <code>    EntryStore.migration={...(EntryStore.migration&#124;&#124;{}),postsOnly:true};</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 68 | <code>    await EntryStore.commit(nextPosts);</code> | 等待异步操作完成后再继续执行。 | Waits for an asynchronous operation to finish before continuing. |
| 69 | <code>    const mediaIds=new Set(nextPosts.flatMap(item=&gt;(item.attachments&#124;&#124;[]).map(a=&gt;String(a.id))));</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
| 70 | <code>    await EntryStore.removeUnreferencedMedia(mediaIds);</code> | 等待异步操作完成后再继续执行。 | Waits for an asynchronous operation to finish before continuing. |
| 71 | <code>  }</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 72 | <code>  // Remove the retired feature from current state and its former local key.</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 73 | <code>  AppStorage.removeItem('qzone_logs_v1');</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 74 | <code>  posts=nextPosts;entriesReady=true;</code> | 执行当前 JavaScript 模块中的一次状态、界面或数据操作。 | Performs a state, UI, or data operation in the current JavaScript module. |
| 75 | <code>  if(window.JetNoteNative?.frontendReady)JetNoteNative.frontendReady();</code> | 按运行时条件选择是否执行下面的逻辑。 | Uses a runtime condition to choose whether the following logic runs. |
| 76 | <code>}</code> | 结束或衔接当前 JavaScript 语句、对象或代码块。 | Closes or connects the current JavaScript statement, object, or block. |
| 77 | <code>async function persistEntries(media=[]){await EntryStore.commit(posts,media);}</code> | 定义 JavaScript 函数或回调，用于封装后续行为。 | Defines a JavaScript function or callback that encapsulates subsequent behavior. |
