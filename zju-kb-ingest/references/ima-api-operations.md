# ima OpenAPI 操作与限制

仅调用官方地址 `https://ima.qq.com/openapi/wiki/v1/`。每次请求使用 HTTP POST，并带 `ima-openapi-clientid`、`ima-openapi-apikey` 与 `Content-Type: application/json` 三个请求头。不得把凭据写入 Skill、ZIP、日志或共享知识库。

## 运行时定位

1. `get_addable_knowledge_base_list`：按名称找到 `浙大校园信息站`，并确认当前协作者对该库有“添加内容”权限。共享/订阅库的普通搜索接口可能不可用，因此不把 `search_knowledge_base` 当成写入前提。
2. `search_knowledge_base`：仅在接口可用时作为普通库搜索补充，不作为共享库写入前提。
3. `get_knowledge_list`：浏览根目录并按标题定位 `00 INDEX`、`10–90`、`98`、`99`。
4. 每次运行重新定位文件夹 ID；不要把 ID 写入 Skill。

所有返回列表都可能分页：首次 `cursor` 传空字符串；当 `is_end=false` 时把 `next_cursor` 用于下一次请求，直到 `is_end=true`。找不到名称不得猜测 ID 或落到根目录。

## 输入路由

| 输入 | 前置检查 | 写入接口 |
| --- | --- | --- |
| HTML 网页 URL | 确认不是视频网页；检查是否为已导入 URL；每批 1–10 个 | `import_urls`，传目标 `folder_id` |
| PDF / Office / Markdown / TXT / 图片 | 检查支持类型、大小、文件名重复；生成上传副本 | `check_repeated_names → create_media → COS 上传 → add_knowledge` |
| ima 原生笔记 | 标题为首个 `#` 标题；日志只追加 | `import_doc` / `append_doc`，再以 `add_knowledge(media_type=11)` 关联 |

## 已知限制

- 网页导入 API 不支持传自定义标题；服务端使用源网页标题。
- 文件上传 API 要求知识库标题等于原始完整文件名。
- URL 指向 PDF、Office 等下载文件时，先下载并走文件上传流，不可当作 HTML 网页导入。
- `import_urls` 的整体 `code=0` 和每条 URL 的 `ret_code=0` 只证明导入任务成功；AI 检索或问答可用性仍需等待并实测。
- 当前公开 API 不提供创建文件夹、移动既有条目、重命名既有条目或删除既有条目。
- 当前知识库 API 可搜索和浏览条目，但不能可靠读取共享 INDEX 的完整正文；因此 Skill 使用与 `00 INDEX` 同版本的 `index-rules.md` 镜像。
- `append_doc` 只适用于当前凭据所属账号创建的原生笔记。协作者必须追加自己的 `00 LOG xx｜…｜{执行者}` 笔记，不能把它当成共享可编辑文档接口。
- API 失败时不追加成功日志。文件或网页已存在时不重复导入。

## 常见失败处理

| 情况 | 处理 |
| --- | --- |
| 凭据失效或无权限 | 停止并让该协作者配置自己的凭据或确认主库写权限 |
| INDEX 版本不一致 | 以共享库 `00 INDEX` 为准；提示镜像已过期，尽快更新 Skill，不能把本地镜像当作权威 |
| 分类不清 | 路由到 98 或只输出分类结果单 |
| 文件超限/类型不支持 | 不上传，说明限制 |
| URL 或文件重复 | 不导入；在结果单中说明已有资料 |
