#!/usr/bin/env node
'use strict';

// Creates one student-facing ima native note, associates it with one folder,
// verifies visibility, then appends the caller's own LOG 01. It never prints
// credentials, document IDs, or API payloads.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const configDir = path.join(os.homedir(), '.config', 'ima');
const KB_NAME = '浙大校园信息站';

function fail(message) { throw new Error(message); }
function parse(argv) { const a = { execute: false, dryRun: false }; for (let i = 2; i < argv.length; i += 1) { const v = argv[i]; if (v === '--execute') a.execute = true; else if (v === '--dry-run') a.dryRun = true; else if (v.startsWith('--')) a[v.slice(2)] = argv[++i]; } return a; }
function secret(name) { try { return fs.readFileSync(path.join(configDir, name), 'utf8').trim(); } catch { return ''; } }
function titleMatches(remote, expected) { const shown = String(remote || '').trim(); if (shown === expected) return true; const prefix = shown.replace(/(?:\.\.\.|…)+$/u, ''); return prefix.length >= 12 && expected.startsWith(prefix); }
function now() { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); const v = Object.fromEntries(p.filter((x) => x.type !== 'literal').map((x) => [x.type, x.value])); return { date: `${v.year}-${v.month}-${v.day}`, compact: `${v.year}${v.month}${v.day}`, time: `${v.hour}${v.minute}` }; }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function post(scope, operation, body, credentials) {
  const response = await fetch(`https://ima.qq.com/openapi/${scope}/v1/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'ima-openapi-clientid': credentials.clientId, 'ima-openapi-apikey': credentials.apiKey }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.code !== 0) fail(`${scope}/${operation}-failed`);
  return payload.data || {};
}
async function listAll(kbId, folderId, credentials) { const rows = []; let cursor = ''; for (let page = 0; page < 30; page += 1) { const body = { knowledge_base_id: kbId, cursor, limit: 50 }; if (folderId) body.folder_id = folderId; const data = await post('wiki', 'get_knowledge_list', body, credentials); rows.push(...(data.knowledge_list || [])); if (data.is_end || !data.next_cursor || data.next_cursor === cursor) break; cursor = data.next_cursor; } return rows; }
async function ownNotes(query, credentials) { const data = await post('note', 'search_note_book', { search_type: 0, query_info: { title: query }, start: 0, end: 20 }, credentials); return (data.docs || []).map((x) => x && x.doc && x.doc.basic_info).filter((x) => x && x.docid); }
async function ownLogTitles(person, credentials) {
  // 日志标题 candidates：canonical（带简称）优先，legacy 兜底。bootstrap 实际创建的是
  // `00 LOG 01｜资料登记｜{显示名}｜{简称}`；只搜不带简称的格式会 own-log-01-not-found。
  const titles = [`00 LOG 01｜资料登记｜${person.name}｜${person.id}`, `00 LOG 01｜资料登记｜${person.name}`];
  for (const title of titles) {
    const docs = await ownNotes(title, credentials);
    const hit = docs.find((x) => x.title === title && x.docid);
    if (hit) return { docid: hit.docid, title };
  }
  return null;
}

async function main() {
  const args = parse(process.argv);
  if (!args['native-note'] || !args.folder || !args.status || !args.source || (args.execute === args.dryRun)) fail('usage-requires-native-note-folder-status-source-and-mode');
  const notePath = path.resolve(args['native-note']); if (!fs.existsSync(notePath)) fail('native-note-file-not-found');
  const markdown = fs.readFileSync(notePath, 'utf8'); const match = markdown.match(/^#\s+(.+)$/m); const title = match ? match[1].trim() : ''; if (!title) fail('native-note-needs-first-h1-title');
  const credentials = { clientId: secret('client_id'), apiKey: secret('api_key') }; if (!credentials.clientId || !credentials.apiKey) fail('ima-credentials-not-configured');
  const profilePath = path.join(configDir, 'zju-kb-collaborator.json'); let person; try { person = JSON.parse(fs.readFileSync(profilePath, 'utf8')); } catch {} if (!person?.name || !/^[A-Za-z0-9_-]{2,8}$/.test(person.id || '')) fail('collaborator-profile-missing');
  // Fail closed before creation: when the note index is unavailable we cannot
  // safely prove that this title has not already been created in a prior run.
  const log01 = await ownLogTitles(person, credentials);
  const existingDocs = (log01 && (await ownNotes(log01.title, credentials)).filter((x) => titleMatches(x.title, title))) || [];
  if (existingDocs.length > 1) fail('native-note-recovery-ambiguous');
  // 库定位：优先 search_knowledge_base（info_list），共享/管理员角色可见；addable 列表兜底。
  let library = null;
  const named = await post('wiki', 'search_knowledge_base', { query: KB_NAME, cursor: '', limit: 20 }, credentials);
  const namedList = (named && named.info_list) || [];
  library = namedList.find((x) => x?.kb_name === KB_NAME);
  if (!library) {
    const libraries = await post('wiki', 'get_addable_knowledge_base_list', { cursor: '', limit: 50 }, credentials);
    library = (libraries.addable_knowledge_base_list || []).find((x) => x?.name === KB_NAME);
  }
  if (!library) fail('target-library-not-addable');
  library.id = library.id || library.kb_id;
  const root = await listAll(library.id, null, credentials); const folder = root.find((x) => x?.media_type === 99 && x.title === args.folder); if (!folder) fail('target-folder-missing');
  const visibleBefore = await listAll(library.id, folder.media_id, credentials); const alreadyVisible = visibleBefore.some((x) => titleMatches(x.title, title));
  const report = { mode: args.dryRun ? 'dry-run' : 'execute', type: 'native-note', title, folder: args.folder, status: args.status, alreadyVisible, imported: false, logEntries: 0, aiRetrieval: '未验证' };
  if (args.dryRun || alreadyVisible) { console.log(JSON.stringify(report, null, 2)); return; }
  let docId = existingDocs[0]?.docid || '';
  if (!docId) {
    const doc = await post('note', 'import_doc', { content_format: 1, content: markdown }, credentials);
    docId = doc.note_id || doc.doc_id || '';
  }
  if (!docId) {
    // Long note titles can be displayed as "...". Search with the caller's LOG
    // title, then compare the stable leading segment rather than full equality.
    for (let attempt = 0; attempt < 3 && !docId; attempt += 1) {
      await wait(2500);
      let docs;
      try { docs = log01 ? await ownNotes(log01.title, credentials) : []; } catch { fail('NATIVE_NOTE_CREATED_PENDING_ASSOCIATION-retry-same-command-do-not-create-again'); }
      const candidates = docs.filter((x) => titleMatches(x.title, title));
      if (candidates.length === 1) docId = candidates[0].docid;
      else if (candidates.length > 1) fail('native-note-recovery-ambiguous');
    }
  }
  if (!docId) fail('NATIVE_NOTE_CREATED_PENDING_ASSOCIATION-retry-same-command-do-not-create-again');
  await post('wiki', 'add_knowledge', { media_type: 11, title, knowledge_base_id: library.id, folder_id: folder.media_id, note_info: { content_id: docId } }, credentials);
  let visible = false; for (let attempt = 0; attempt < 8 && !visible; attempt += 1) { visible = (await listAll(library.id, folder.media_id, credentials)).some((x) => titleMatches(x.title, title)); if (!visible) await wait(800); }
  if (!visible) fail('native-note-not-visible-after-association');
  const log = log01 || (await ownLogTitles(person, credentials)); if (!log || !log.docid) fail('own-log-01-not-found');
  const clock = now(); const old = await post('note', 'get_doc_content', { doc_id: log.docid, target_content_format: 0 }, credentials); const rx = new RegExp(`ZJU-${clock.compact}-${clock.time}-${person.id}-(\\d{2,})`, 'g'); let serial = 0; for (const m of String(old.content || '').matchAll(rx)) serial = Math.max(serial, Number(m[1]) || 0); const registrationId = `ZJU-${clock.compact}-${clock.time}-${person.id}-${String(serial + 1).padStart(2, '0')}`;
  await post('note', 'append_doc', { doc_id: log.docid, content_format: 1, content: `\n## ${registrationId}｜${clock.date}\n\n资料标题：${title}\n资料类型：原生笔记\n来源：${args.status}（${args.source}）\n原始链接或原始文件名：详见笔记“来源”章节\n初始位置：\`${args.folder}\`\n初始状态：${args.status}\n导入核对：原生笔记创建成功且目录可见\nAI 检索状态：未验证\n操作发起/授权者：${args['requested-by'] || '知识库管理员'}\n执行者：${person.name}\n` }, credentials);
  console.log(JSON.stringify({ ...report, imported: true, visibleInFolder: true, registrationId, logEntries: 1 }, null, 2));
}
main().catch((error) => { console.log(JSON.stringify({ completed: false, error: error?.message || 'native-note-ingest-failed' })); process.exitCode = 1; });
