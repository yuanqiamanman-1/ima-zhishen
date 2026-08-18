# ima OpenAPI 凭据接入卡

> 由 Skill 在首次需要读取或写入知识库时触发。控制通道是官方 ima OpenAPI，不需要 CLI 或浏览器插件。

## A. 首次检查

Skill 先运行 `scripts/check-ima-openapi.ps1`（Windows）或 `node scripts/check-ima-openapi.cjs`（跨平台）。若 `ready` 为 `false`，它必须问：

```text
未检测到你的 ima OpenAPI 凭据。要现在配置吗？
1. 配置
2. 暂不配置
```

- **配置**：继续 B。
- **暂不配置**：Skill 只给出分类、命名、目标目录和日志草稿；不能调用 API 或声称已经导入。

## A.1 协作者身份卡

第一次要创建个人日志时，Skill 会询问：

```text
为创建你的个人日志，请告诉我两项：
① 你希望在日志中显示的协作者名字；
② 一个固定的 2–8 位英文/数字简称（如 xsh），它会写入资料登记号。
```

- `日志显示名`：例如 `项思涵`；它出现在日志标题和“执行者”字段。
- `固定简称`：例如 `xsh`；它用于 `ZJU-20260815-1430-xsh-01` 这类不撞号的登记 ID。
- 这两项仅保存到协作者自己的本机配置，不写入凭据文件；简称如和已有协作者冲突，Skill 会要求另选。

## B. 配置自己的官方凭据

1. 登录 `https://ima.qq.com/agent-interface`。
2. 获取本人 `Client ID` 与 `API Key`。
3. 在本机运行 `scripts/save-ima-credentials.ps1`，在终端内输入两项值；脚本不回显、不上传、不把值写入 Skill 或日志。
4. 再运行 `scripts/check-ima-openapi.ps1` 或 `node scripts/check-ima-openapi.cjs`，确认返回 `ready: true`。这一步仅表示本机已配置凭据。
5. 真正开始写入前，再运行 `node scripts/preflight-ima-openapi.cjs`。`knowledgeBaseFound: true` 表示已定位到共享库；只有 `writeAccess: true` / `writeAccessEvidence: confirmed-by-addable-list` 才表示已由可添加列表确认写权限。共享库可能仅能定位而无法预先确认写权限，此时会标为 `unverified-shared-library-visibility-only`，实际导入仍会通过官方写接口验证，并且失败时不会写成功日志。

## C. API 调用约定

Skill 通过以下官方调用模板控制 ima：

```text
POST https://ima.qq.com/openapi/wiki/v1/{operation}
ima-openapi-clientid: <Client ID>
ima-openapi-apikey: <API Key>
Content-Type: application/json
```

典型 `operation`：`search_knowledge_base`、`get_knowledge_base`、`get_knowledge_list`、`import_urls`、`search_knowledge`、`import_doc`、`append_doc`、`add_knowledge`。

任何 Key 或 Client ID 只允许发送到 `ima.qq.com`；不得发送到第三方 CLI、浏览器插件、日志、共享文档、Git 或聊天。

若凭据曾出现在聊天、截图、公开文档或 Git 历史中，应立刻到官方页面撤销并重新生成；旧凭据不得继续使用。

## D. 面向普通订阅者的根目录说明

管理员初始化公开界面时，应把 `assets/01-使用说明｜浙大校园信息站.md` 作为原生笔记放到知识库根目录，不能放入 `10–99` 的资料分类，也不能混入 `00 管理规则与日志`。

知识库简介建议使用：

> 浙大校园信息站：校园办事、学习和生活信息；含官方资料与有来源经验，请以来源与日期为准。
