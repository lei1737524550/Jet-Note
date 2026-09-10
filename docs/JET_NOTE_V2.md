# `.jnote` formatVersion 2

v2 是 Jet Note 当前使用的 ZIP 交换格式。固定核心文件为 `manifest.json`、`data/posts.json`、`checksums.json`，新导出的备份还包含 `data/profile.json`；媒体保存到 `media/`。Manifest 的 `content` 至少包含 `posts`，并可包含 `profile`。

每条 Post 包含稳定 id、type=`post`、text、createdAt、updatedAt、attachments、extra。每个附件保存 id、type、MIME、原始文件名、path、size、SHA-256 和可选扩展元数据。导入支持合并、仅新增和覆盖。

`data/profile.json` 保存用户名以及头像状态。自定义头像以原有 data URL 数据保存；默认头像不重复塞入备份，而是记录为默认状态，导入后恢复应用内置默认头像。旧的、不含 `profile` 的 formatVersion 2 备份仍可导入。

日志字段和 v1 兼容导入器已经删除。独立相册不在备份范围内；背景、语言、头像形状等外观设置仍使用独立的本地存储。
