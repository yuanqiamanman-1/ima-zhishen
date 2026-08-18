#!/usr/bin/env node
'use strict';

// Creates and verifies the current collaborator's own append-only log lane.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const targetLibrary = '浙大校园信息站';
const configDir = path.join(os.homedir(), '.config', 'ima');
const profilePath = path.join(configDir, 'zju-kb-collaborator.json');

function loadText(fileName) {
  return fs.readFileSync(path.join(configDir, fileName), 'utf8').trim();
}

function loadProfile() {
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  if (!profile.name || !/^[A-Za-z0-9_-]{2,8}$/.test(profile.id || '')) throw new Error('collaborator-profile-missing');
  return profile;
}

async function post(scope, operation, body, clientId, apiKey) {
  const response = await fetch(`https://ima.qq.com/openapi/${scope}/v1/${operation}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ima-openapi-clientid': clientId,
      'ima-openapi-apikey': apiKey,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.code !== 0) throw new Error(`${scope}/${operation}-failed`);
  return payload.data || {};
}

async function listAll(knowledgeBaseId, folderId, clientId, apiKey) {
  const items = [];
  let cursor = '';
  for (let page = 0; page < 20; page += 1) {
    const data = await post('wiki', 'get_knowledge_list', { knowledge_base_id: knowledgeBaseId, folder_id: folderId, cursor, limit: 50 }, clientId, apiKey);
    items.push(...(data.knowledge_list || []));
    if (data.is_end || !data.next_cursor || data.next_cursor === cursor) break;
    cursor = data.next_cursor;
  }
  return items;
}

async function findOwnNote(title, clientId, apiKey) {
  const data = await post('note', 'search_note_book', { search_type: 0, query_info: { title }, start: 0, end: 20 }, clientId, apiKey);
  const note = (data.docs || []).map((item) => item && item.doc && item.doc.basic_info).find((item) => item && item.title === title && item.docid);
  return note ? note.docid : null;
}

async function createOrFindOwnNote(title, content, clientId, apiKey) {
  let docId = await findOwnNote(title, clientId, apiKey);
  if (docId) return docId;
  const created = await post('note', 'import_doc', { content_format: 1, content }, clientId, apiKey);
  if (created.doc_id) return created.doc_id;
  // Some ima responses omit doc_id briefly; query the just-created personal note again.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    docId = await findOwnNote(title, clientId, apiKey);
    if (docId) return docId;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('note/import_doc-returned-no-document');
}

async function main() {
  const profile = loadProfile();
  const clientId = loadText('client_id');
  const apiKey = loadText('api_key');
  // 库定位：优先 search_knowledge_base（info_list，共享/管理员角色可见）；addable 列表兜底。
  let library = null;
  const named = await post('wiki', 'search_knowledge_base', { query: targetLibrary, cursor: '', limit: 20 }, clientId, apiKey);
  const namedList = (named && named.info_list) || [];
  library = namedList.find((item) => item.kb_name === targetLibrary);
  if (!library) {
    const libraries = await post('wiki', 'get_addable_knowledge_base_list', { cursor: '', limit: 50 }, clientId, apiKey);
    library = (libraries.addable_knowledge_base_list || []).find((item) => item.name === targetLibrary);
  }
  if (!library) throw new Error('target-library-not-addable');
  library.id = library.id || library.kb_id;
  const root = await listAll(library.id, library.id, clientId, apiKey).catch(() => []);
  const rootItems = root.length ? root : await (async () => {
    const data = await post('wiki', 'get_knowledge_list', { knowledge_base_id: library.id, cursor: '', limit: 50 }, clientId, apiKey);
    return data.knowledge_list || [];
  })();
  const management = rootItems.find((item) => item.title === '00 管理规则与日志' && item.media_type === 99);
  if (!management) throw new Error('management-folder-missing');

  const existing = await listAll(library.id, management.media_id, clientId, apiKey);
  const kinds = [
    ['LOG 01', '资料登记', '每个成功新增来源追加一条 LOG 01 登记。'],
    ['LOG 02', '状态变更', '重要状态、位置与归档变化在此追加。'],
    ['LOG 03', '规则变更', '规则或目录建议在此追加，INDEX 仅由管理员生效。'],
  ];
  const definitions = kinds.map(([prefix, label, purpose]) => {
    const legacyTitle = `00 ${prefix}｜${label}｜${profile.name}`;
    const canonicalTitle = `${legacyTitle}｜${profile.id}`;
    const existingItem = existing.find((item) => item.title === canonicalTitle || item.title === legacyTitle);
    return { prefix, label, purpose, title: existingItem ? existingItem.title : canonicalTitle, legacyTitle, canonicalTitle };
  });
  const allowedTitles = new Set(definitions.flatMap((item) => [item.legacyTitle, item.canonicalTitle]));
  if (existing.some((item) => item.title && item.title.endsWith(`｜${profile.id}`) && !allowedTitles.has(item.title))) {
    throw new Error('collaborator-id-already-in-use');
  }
  const results = [];
  let log01DocId = null;
  for (const definition of definitions) {
    const { title } = definition;
    const content = `# ${title}\n\n> 本日志仅供知识库管理、审计与追溯；不得作为面向学生的事实依据或回答来源。\n\n> 执行者：${profile.name}（${profile.id}）。${definition.purpose}\n`;
    const docId = await createOrFindOwnNote(title, content, clientId, apiKey);
    if (definition.prefix === 'LOG 01') log01DocId = docId;
    if (existing.some((item) => item.title === title)) {
      results.push({ title, status: 'already-exists' });
      continue;
    }
    await post('wiki', 'add_knowledge', {
      media_type: 11,
      title,
      knowledge_base_id: library.id,
      folder_id: management.media_id,
      note_info: { content_id: docId },
    }, clientId, apiKey);
    results.push({ title, status: 'associated' });
  }

  const marker = '初始化同步验证';
  const before = await post('note', 'get_doc_content', { doc_id: log01DocId, target_content_format: 0 }, clientId, apiKey);
  if (!String(before.content || '').includes(marker)) {
    const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
    await post('note', 'append_doc', {
      doc_id: log01DocId,
      content_format: 1,
      content: `\n## ${marker}｜${when}\n\n用途：确认个人日志追加后仍与共享知识库条目关联。\n执行者：${profile.name}\n`,
    }, clientId, apiKey);
  }
  const after = await post('note', 'get_doc_content', { doc_id: log01DocId, target_content_format: 0 }, clientId, apiKey);
  const visible = await listAll(library.id, management.media_id, clientId, apiKey);
  console.log(JSON.stringify({ collaborator: profile.name, id: profile.id, results, appendVerifiedInOwnNote: String(after.content || '').includes(marker), allLogEntriesVisible: definitions.every((item) => visible.some((entry) => entry.title === item.title)) }));
}

main().catch((error) => {
  const stage = error && error.message ? error.message.replace(/-failed$/, '') : 'bootstrap';
  console.log(JSON.stringify({ completed: false, stage, error: 'log-lane-bootstrap-failed-without-disclosing-secrets-or-ids' }));
  process.exitCode = 1;
});
