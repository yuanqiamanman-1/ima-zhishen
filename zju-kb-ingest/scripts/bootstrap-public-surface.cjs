#!/usr/bin/env node
'use strict';

// Creates only the two administrator-approved public notes. No credentials or IDs are printed.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const skillRoot = path.resolve(__dirname, '..');
const targetLibrary = '浙大校园信息站';
const configDir = path.join(os.homedir(), '.config', 'ima');

function secret(name) {
  return fs.readFileSync(path.join(configDir, name), 'utf8').trim();
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
  if (!response.ok || !payload || payload.code !== 0) throw new Error(`${scope}/${operation} failed`);
  return payload.data || {};
}

async function listAll(knowledgeBaseId, folderId, clientId, apiKey) {
  const items = [];
  let cursor = '';
  for (let page = 0; page < 20; page += 1) {
    const body = { knowledge_base_id: knowledgeBaseId, cursor, limit: 50 };
    if (folderId) body.folder_id = folderId;
    const data = await post('wiki', 'get_knowledge_list', body, clientId, apiKey);
    items.push(...(data.knowledge_list || []));
    if (data.is_end || !data.next_cursor || data.next_cursor === cursor) break;
    cursor = data.next_cursor;
  }
  return items;
}

async function findOwnNote(title, clientId, apiKey) {
  const data = await post('note', 'search_note_book', {
    search_type: 0,
    query_info: { title },
    start: 0,
    end: 20,
  }, clientId, apiKey);
  const note = (data.docs || [])
    .map((item) => item && item.doc && item.doc.basic_info)
    .find((item) => item && item.title === title && item.docid);
  return note ? note.docid : null;
}

async function addNativeNote({ title, markdown, knowledgeBaseId, folderId, clientId, apiKey }) {
  let docId = await findOwnNote(title, clientId, apiKey);
  if (!docId) {
    const doc = await post('note', 'import_doc', { content_format: 1, content: markdown }, clientId, apiKey);
    if (doc.doc_id) {
      docId = doc.doc_id;
    } else {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        docId = await findOwnNote(title, clientId, apiKey);
        if (docId) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      if (!docId) throw new Error('note/import_doc returned no document');
    }
  }
  const body = {
    media_type: 11,
    title,
    knowledge_base_id: knowledgeBaseId,
    note_info: { content_id: docId },
  };
  if (folderId) body.folder_id = folderId;
  await post('wiki', 'add_knowledge', body, clientId, apiKey);
}

async function main() {
  let stage = 'read-credentials';
  const clientId = secret('client_id');
  const apiKey = secret('api_key');
  stage = 'locate-addable-library';
  const libraries = await post('wiki', 'get_addable_knowledge_base_list', { cursor: '', limit: 50 }, clientId, apiKey);
  const library = (libraries.addable_knowledge_base_list || []).find((item) => item.name === targetLibrary);
  if (!library) throw new Error('target library is not addable');

  stage = 'list-root';
  const rootItems = await listAll(library.id, null, clientId, apiKey);
  const managementFolder = rootItems.find((item) => item.title === '00 管理规则与日志' && item.media_type === 99);
  if (!managementFolder) throw new Error('management folder is missing');

  const notes = [
    {
      title: '01 使用说明｜浙大校园信息站',
      markdown: fs.readFileSync(path.join(skillRoot, 'assets', '01-使用说明｜浙大校园信息站.md'), 'utf8'),
      folderId: null,
    },
    {
      title: '00 INDEX｜浙大校园信息站｜v1.2',
      markdown: fs.readFileSync(path.join(skillRoot, 'references', 'index-rules.md'), 'utf8'),
      folderId: managementFolder.media_id,
    },
  ];

  const results = [];
  for (const note of notes) {
    stage = `inspect-${note.title}`;
    const before = await listAll(library.id, note.folderId, clientId, apiKey);
    if (before.some((item) => item.title === note.title)) {
      results.push({ title: note.title, status: 'already-exists', visible: true });
      continue;
    }
    stage = `associate-${note.title}`;
    await addNativeNote({ ...note, knowledgeBaseId: library.id, clientId, apiKey });
    stage = `verify-${note.title}`;
    const after = await listAll(library.id, note.folderId, clientId, apiKey);
    results.push({ title: note.title, status: after.some((item) => item.title === note.title) ? 'imported-and-visible' : 'imported-not-yet-visible' });
  }
  console.log(JSON.stringify({ targetLibrary, results }));
}

main().catch((error) => {
  // The operation name is safe to disclose; response bodies, IDs and credentials are not.
  const stage = error && error.message && error.message.includes('/') ? error.message.replace(' failed', '') : 'bootstrap';
  console.log(JSON.stringify({ completed: false, stage, error: 'bootstrap-failed-without-disclosing-secrets-or-ids' }));
  process.exitCode = 1;
});
