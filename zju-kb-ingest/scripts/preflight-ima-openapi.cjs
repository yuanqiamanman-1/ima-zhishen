#!/usr/bin/env node
'use strict';

// Read-only preflight. It deliberately reports no credential values or internal IDs.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const targetName = process.argv[2] || '浙大校园信息站';
const configDir = path.join(os.homedir(), '.config', 'ima');

function readSecret(name) {
  try {
    return fs.readFileSync(path.join(configDir, name), 'utf8').trim();
  } catch {
    return '';
  }
}

async function post(operation, body, clientId, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://ima.qq.com/openapi/wiki/v1/${operation}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ima-openapi-clientid': clientId,
        'ima-openapi-apikey': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    return { httpOk: response.ok, code: payload && typeof payload.code === 'number' ? payload.code : null, payload };
  } catch {
    return { httpOk: false, code: null, payload: null };
  } finally {
    clearTimeout(timer);
  }
}

async function hasNamedKnowledgeBase(operation, field, clientId, apiKey) {
  let cursor = '';
  for (let page = 0; page < 20; page += 1) {
    // search_knowledge_base 的 limit 上限为 20；get_addable_knowledge_base_list 可用 50。
    const limit = operation === 'search_knowledge_base' ? 20 : 50;
    const result = await post(operation, { cursor, limit, ...(operation === 'search_knowledge_base' ? { query: targetName } : {}) }, clientId, apiKey);
    if (!result.httpOk || result.code !== 0 || !result.payload) return { apiOk: false, found: false };
    const data = result.payload.data || result.payload;
    const items = data[field] || [];
    if (items.some((item) => item && (item.name === targetName || item.kb_name === targetName))) return { apiOk: true, found: true };
    if (data.is_end || !data.next_cursor || data.next_cursor === cursor) return { apiOk: true, found: false };
    cursor = data.next_cursor;
  }
  return { apiOk: false, found: false };
}

async function main() {
  const clientId = readSecret('client_id');
  const apiKey = readSecret('api_key');
  if (!clientId || !apiKey) {
    console.log(JSON.stringify({ configured: false, apiReachable: false, knowledgeBaseFound: false, writeAccess: false, readyForWrite: false, nextAction: 'configure-at-ima-agent-interface' }));
    process.exitCode = 1;
    return;
  }

  // search_knowledge_base locates a named shared library. Visibility is not
  // evidence of add-content permission, so query addable separately whenever
  // the endpoint is available.
  const named = await hasNamedKnowledgeBase('search_knowledge_base', 'info_list', clientId, apiKey);
  const addable = await hasNamedKnowledgeBase('get_addable_knowledge_base_list', 'addable_knowledge_base_list', clientId, apiKey);
  const apiReachable = named.apiOk || addable.apiOk;
  const found = named.found || addable.found;
  const writeAccess = addable.found;
  const writeAccessEvidence = writeAccess ? 'confirmed-by-addable-list' : (found ? 'unverified-shared-library-visibility-only' : 'not-found');
  const result = {
    configured: true,
    apiReachable,
    knowledgeBaseFound: found,
    writeAccess,
    writeAccessEvidence,
    readyForWrite: apiReachable && found,
    nextAction: apiReachable && found ? (writeAccess ? 'resolve-folders-and-import' : 'resolve-folders-and-import-write-unverified') : 'check-credentials-or-library-permission',
  };
  console.log(JSON.stringify(result));
  if (!result.readyForWrite) process.exitCode = 1;
}

main();
