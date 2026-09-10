# `.jet-note` formatVersion 2

v2 是只包含说说的 ZIP 交换格式。固定文件为 `manifest.json`、`data/posts.json`、`checksums.json`，媒体保存到 `media/`。Manifest 的 content 只允许 posts。

每条 Post 包含稳定 id、type=`post`、text、createdAt、updatedAt、attachments、extra。每个附件保存 id、type、MIME、原始文件名、path、size、SHA-256 和可选扩展元数据。导入支持合并、仅新增和覆盖。

日志字段和 v1 兼容导入器已经删除。独立相册、头像、头像形状、背景和语言设置不在备份范围内；这些外观设置使用独立的本地存储。
