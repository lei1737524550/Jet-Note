# assets/demo.json — 双语逐行备注 / Bilingual line notes

原文件保持不变，以下备注按原文件行号对应。JSON 和第三方压缩库不插入行内注释，以避免破坏解析或依赖完整性。

The source file remains unchanged. These notes map to its original line numbers. JSON and minified third-party libraries receive sidecar notes so parsing and dependency integrity stay intact.

| 行 / Line | 原始内容 / Source | 中文备注 | English note |
| ---: | --- | --- | --- |
| 1 | <code>{</code> | 开始一个 JSON 对象或数组。 | Begins a JSON object or array. |
| 2 | <code>    "launch_mode": "user",</code> | 配置键“launch_mode”及其对应值；JSON 保持无注释以便程序解析。 | Sets configuration key “launch_mode” and its value; JSON remains comment-free so the app can parse it. |
| 3 | <code>    "display_demo_switch": true,</code> | 配置键“display_demo_switch”及其对应值；JSON 保持无注释以便程序解析。 | Sets configuration key “display_demo_switch” and its value; JSON remains comment-free so the app can parse it. |
| 4 | <code>    "demo_policy": "read_only_session"</code> | 配置键“demo_policy”及其对应值；JSON 保持无注释以便程序解析。 | Sets configuration key “demo_policy” and its value; JSON remains comment-free so the app can parse it. |
| 5 | <code>}</code> | 结束当前 JSON 对象或数组。 | Ends the current JSON object or array. |
