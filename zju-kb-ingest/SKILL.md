---
name: zju-kb-ingest
description: Classify and import trusted ZJU campus materials into the ima knowledge base “浙大校园信息站”. Use when a collaborator needs to add web URLs, PDFs, Office files, or native notes; synthesize multiple CC98 and original sources into a detailed native experience note; organize a batch; process the 98 pending queue; or record a material/status/rule change. Follow the shared INDEX, route uncertain material to 98, and append the appropriate LOG after a successful change.
---

# 浙大校园信息站入库协作 Skill

Use this Skill only for the shared knowledge base `浙大校园信息站`. Never share a user's API credentials.

## Required references

Read these before any write:

1. [ima OpenAPI setup](references/getting-started.md) — use when the collaborator's official Client ID or API Key is missing.
2. [INDEX v1.2](references/index-rules.md) — the execution mirror of the public `00 INDEX` note, including the only log templates and ID allocation rule.
3. [Folder map](references/folder-map.md) — category boundaries.
4. [ima API operations](references/ima-api-operations.md) — endpoint routing, pagination, batch limits, and limitations.
5. [Multi-source experience-note template](references/multi-source-experience-note-template.md) — read when two or more sources must become one student-facing native note.

The shared-library `00 INDEX` is the sole authority. This bundled mirror is an offline execution aid for API-only runs because the API cannot reliably read a shared native note in full. If the two versions differ, use the shared INDEX in the ima client, report the mismatch, and update this Skill when practical; do **not** silently treat the local mirror as authoritative or block an otherwise approved import solely on the version mismatch.

## Workflow

### Public-library bootstrap

When the administrator explicitly asks to bootstrap the public surface, create the bundled [ordinary-user guide](assets/01-使用说明｜浙大校园信息站.md) as one native note at the knowledge-base root, outside every category folder. Its title must be `01 使用说明｜浙大校园信息站`. It is for subscribers, not a source of campus facts. Do not create it automatically during an ordinary material import.

### 0. Onboard when needed

- Before creating or appending a personal log lane, run `node scripts/get-zju-collaborator-profile.cjs`. If it is not ready, ask exactly: **“为创建你的个人日志，请告诉我两项：① 你希望在日志中显示的协作者名字；② 一个固定的 2–8 位英文/数字简称（如 `xsh`），它会写入资料登记号。”** Do not infer either value from an account name.
- After the collaborator answers, save the local profile with `node scripts/save-zju-collaborator-profile.cjs --name "显示名" --id "简称"`. If the ID is already used by another visible `00 LOG` title, ask for another ID before creating any log note. New log titles include both values: `00 LOG 01｜资料登记｜{显示名}｜{简称}`; existing legacy log titles are not renamed by API.
- Run `scripts/check-ima-openapi.ps1` (Windows) or `node scripts/check-ima-openapi.cjs` (Windows/macOS/Linux) before the first API write. This only proves credentials are present; it does not prove access.
- If `ready` is false, ask exactly: **“未检测到你的 ima OpenAPI 凭据。要现在配置吗？配置 / 暂不配置。”**
- For `配置`, direct the collaborator to `https://ima.qq.com/agent-interface` to obtain their own official `Client ID` and `API Key`, then run `scripts/save-ima-credentials.ps1` locally. Never request values in chat.
- For `暂不配置`, provide the classification receipt, filename, target directory, and log draft only. Do not call a write API or claim an import succeeded.
- With `ready: true`, run `node scripts/preflight-ima-openapi.cjs` before the first write in a session. Continue only when it returns `readyForWrite: true`: this read-only check confirms the official API can see `浙大校园信息站` in the caller's addable-library list and that the caller has add-content permission. It never prints credentials or internal IDs.
- With `readyForWrite: true`, use only the official base URL `https://ima.qq.com/openapi/wiki/v1/` and the headers `ima-openapi-clientid` and `ima-openapi-apikey`. No CLI or browser plugin is required.

### 1. Preflight

- Confirm the caller explicitly asked to import, not merely to classify or discuss.
- Use the caller's own ima credentials and confirm the target knowledge base is `浙大校园信息站`.
- Resolve the current folder IDs by name at runtime with `get_knowledge_list`, following `next_cursor` until the target folder is found. Never hard-code IDs.
- Split web URLs into batches of at most 10. Detect whether a URL resolves to HTML or a downloadable file before importing: HTML pages use `import_urls`; PDFs/Office files use the file upload flow.
- Deduplicate before writing: check a file through `check_repeated_names`; for webpages, search the existing folder/list and `LOG 01` for the exact URL or clearly identical title. The API has no guaranteed URL-level dedupe, so uncertain matches stop for human review rather than re-importing.

### 2. Multi-source experience notes

Whenever the output is a student-facing **integrated answer**—whether it combines several sources or substantially reorganizes one source—create **one detailed native experience note** instead of importing a post-by-post summary. This applies especially to CC98 experience plus original official/public materials.

Raw webpages, PDFs, files and original posts remain source material. They may be retained separately when valuable, but they never replace the integrated native note that ima should retrieve for a student question.

Before writing the note:

- Read `references/multi-source-experience-note-template.md` and the current INDEX.
- Choose one primary folder and status `经验` unless the note consists solely of current official material.
- Use the exact title and source formats in that template. Keep the body detailed and searchable: retain concrete systems, aliases, action paths, conditions, exceptions, and official check points. Its internal section structure is free.
- List only the original materials actually used. Do not list discovery or verification tools such as 百事通 or 浙小本; if either tool finds a document, cite that original document instead.
- Do not copy long forum passages or expose CC98 internal links. A single CC98 source row covers any useful comments from that same topic.
- Omit contradictory, unsupported, or personal claims; do not resolve conflicts by counting replies.

When explicitly authorized to import, create the note through the native-note API flow (`note/import_doc` followed by `wiki/add_knowledge`) and verify it is visible in the chosen folder. The student-facing note does **not** carry a management disclaimer; that disclaimer is only for `00 LOG` and other management notes. Record the finished native note in `LOG 01` after visibility is verified.

If a valuable original public page should also remain searchable in full, import it separately only after the native note has a clear source row and its own duplicate check. Never create duplicate notes just to make one topic appear in several folders.

### 3. Classify

For each input, decide its one primary category and a lightweight status according to the INDEX. A useful source with a clear origin and clear category is eligible even if it is a forum post or personal experience; use `经验`, not `98`.

Before a mixed or ambiguous batch, show this receipt:

```text
资料：
类型：文件 / 网页 / 原生笔记
收录决定：正式收录 / 98 待处理 / 不收录
目标目录：
标题处理：规范文件名 / 保留源网页标题 / 原生笔记标题
理由：
```

If the user explicitly instructed the Skill to import, proceed after producing the receipt. Otherwise stop after the receipt.

### 4. Import

Use one collaborator-facing command for every normal intake. The AI chooses the folder/status/source after reading INDEX; the collaborator does not choose an API route:

```text
node scripts/ingest.cjs --url <URL> --folder <INDEX目录> --status <官方/经验/待处理/历史资料> --source <来源说明> --execute
node scripts/ingest.cjs --file <本地文件> --folder <INDEX目录> --status <官方/经验/待处理/历史资料> --source <来源说明> --upload-name <规范文件名> --execute
node scripts/ingest.cjs --native-note <Markdown路径> --folder <INDEX目录> --status <官方/经验/待处理/历史资料> --source <来源说明> --execute
```

Run the same command with `--dry-run` before an uncertain or mixed intake. `ingest.cjs` routes URLs to the webpage importer and local files to the COS-upload path; it does not expose that distinction to the collaborator.

- **Local file**: preserve the original; supply an INDEX-formatted `--upload-name` for the uploaded copy/title; run file-type, size, and duplicate checks; then execute `check_repeated_names → create_media → COS upload → add_knowledge` with the target `folder_id`.
- **Web URL**: preserve the source page title; call `import_urls` with 1–10 HTML URLs and the target `folder_id`. Do not fabricate a new title or re-import merely to change one.
- **Reusable web batch**: after the classification receipt is approved, prepare a non-secret JSON manifest and run `node scripts/ingest-url-batch.cjs --manifest <path> --execute`. It resolves target folders at runtime, rejects non-HTML URLs, imports no more than 10 URLs per folder request, verifies the returned media entry by its API media identity, and only then appends this collaborator's `LOG 01`. Use `--dry-run` first when the source set or folder classification is still under discussion. For a many-folder manifest, run each group as `--folder "目录名"`; this keeps external waits bounded and preserves a clean, per-directory receipt. `--record-visible` is only for reconciling a previously accepted, already visible webpage whose original run stopped before logging; provide its verified `visibleTitle` in the manifest and never use it to bypass a normal import check.
- **Native note**: for a multi-source experience note, use the exact header and footer from `references/multi-source-experience-note-template.md`, then call `ingest.cjs --native-note`. It creates the note, handles ima's truncated long-title search result, associates it with one folder, verifies visibility, and appends `LOG 01`. If it reports `NATIVE_NOTE_CREATED_PENDING_ASSOCIATION`, do not create another note; wait and re-run the same command. For a management note, use the management disclaimer.
- **Native-note recovery**: `note/import_doc` may succeed without immediately returning a usable `doc_id`, and ima may truncate a long displayed title with `...`. First save the exact intended title and target folder in the current receipt. On recovery, locate one candidate by its stable leading title segment, treating `remoteTitle...` as a match only when the intended title starts with that visible prefix. Never require an exact long-title match. If no single candidate can be proven, stop as `NATIVE_NOTE_CREATED_PENDING_ASSOCIATION`; do not call `import_doc` again. Once the existing document is found, run only `wiki/add_knowledge` → target-folder visibility check → `LOG 01` append.
- **Uncertain item**: route to `98 待分拣与待核验` only when the source is unknown, the category cannot be chosen, the content conflicts, or it is plainly likely to mislead. Do not use `98` merely because a source is non-official.

### 5. Record and verify

- Only after a successful API response and visible-entry verification, append the appropriate log entry using the templates embedded in the INDEX.
- Use the caller's own log lane: `00 LOG 01｜资料登记｜{执行者}` / `00 LOG 02｜状态变更｜{执行者}` / `00 LOG 03｜规则变更｜{执行者}` in `00 管理日志`. If it does not yet exist, create that native note under the caller's own account, associate it with the shared library, and verify one test append is reflected in the shared entry before treating it as the audit trail.
- Use `node scripts/bootstrap-personal-log-lane.cjs` after saving the collaborator profile to create or reuse the three personal log notes and perform the one-time append verification.
- Use the saved `显示名` in the three log titles and the saved `简称` in every `ZJU-YYYYMMDD-HHMM-简称-批次序号` registration ID.
- Only append an original note created by the caller's own account. Never append another collaborator's or the administrator's native note through the API.
- Only the knowledge-base administrator may append a new `00 INDEX` effective patch. A collaborator records a proposed rule change in their own `LOG 03`; automatic import remains on the current approved INDEX version.
- `LOG 01` records successful new material batches.
- `LOG 02` records important status, title, location, or archive changes.
- `LOG 03` records INDEX, folder, and migration changes.
- Verify the target folder contains the new item, following pagination if needed. For web imports, both overall `code=0` and each URL's `ret_code=0` are required. If an API step fails, report the failure and do not write a success log.
- Report the result precisely: `已导入，AI 检索未验证` unless a later `search_knowledge` or client question has actually confirmed retrieval. Never infer AI Q&A readiness from import success.

## Non-negotiable rules

- One source has one primary home; never duplicate to solve cross-category relevance.
- Do not import marketing, personal data, private contact details, or unsupported material.
- Do not treat a forum post or personal experience as an official policy; preserve its source and mark it `经验` in `LOG 01`.
- Do not create a new category or subfolder without an INDEX change and a `LOG 03` entry.
- Do not attempt API-based move, rename, or delete of existing knowledge entries; these are not in the current supported API surface.
- Do not use management logs as student-facing evidence.
- Give every `LOG 01` entry the timestamp-and-executor ID required by the INDEX; do not use a global sequential number.
