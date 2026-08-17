# ima之神

面向浙江大学校园信息共享库的 ima 导入 Skill。它把“找资料”与“写给学生看的答案”分开：原始网页、PDF、官方 FAQ 和 CC98 帖子用于追溯；经过整理的学生答案统一以 ima 原生笔记入库，供 ima AI 更稳定地检索。

## 包含什么

- 网页、文件、原生笔记的官方 ima OpenAPI 导入流程。
- 目录分类、去重、可见性验证和个人 `LOG 01` 审计记录。
- 多来源经验整理模板：CC98 经验来源 + 原始材料来源。
- 原生笔记导入器，处理 ima 长标题显示省略号后的恢复关联。
- “fail closed” 防重逻辑：笔记搜索异常时停止，不重复创建内容。

## 安装

将 `zju-kb-ingest/` 放入本机 Codex Skills 目录：

```text
%USERPROFILE%\.codex\skills\zju-kb-ingest\
```

首次使用请在 ima 官方页面获取自己的 Client ID 与 API Key，并按 Skill 中的接入卡仅保存到本机。不要提交、分享或写入任何凭据。

## 原生笔记导入

```powershell
node scripts/ingest.cjs `
  --native-note "C:\路径\整理笔记.md" `
  --folder "90 杭州、交通与校外生活" `
  --status "经验" `
  --source "CC98 经验与原始材料整理" `
  --execute
```

整理笔记应遵循 `references/multi-source-experience-note-template.md`：正文尽可能保留具体操作、条件、例外和时效边界；来源只列 CC98 原帖和实际使用的原始材料，不列用于检索的工具。

## 安全与边界

- 不包含任何 ima 凭据、知识库内容、个人日志或用户资料。
- 不绕过权限、不伪造身份、不调用未公开接口。
- 导入成功只代表资料已进入知识库；AI 检索是否可用需要单独验证。
