#!/usr/bin/env node
'use strict';

// Safe, reusable HTML-webpage importer for the shared ZJU ima knowledge base.
// It deliberately never prints credentials or internal identifiers.
// Usage: node ingest-url-batch.cjs --manifest <batch.json> --dry-run|--execute

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const API_BASE = 'https://ima.qq.com/openapi';
const DEFAULT_LIBRARY = '浙大校园信息站';
const configDir = path.join(os.homedir(), '.config', 'ima');

function fail(message) {
  throw new Error(message);
}

function argsOf(argv) {
  const args = { execute: false, dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--execute') args.execute = true;
    else if (value === '--dry-run') args.dryRun = true;
    else if (value === '--record-visible') args.recordVisible = true;
    else if (value === '--debug-visible-titles') args.debugVisibleTitles = true;
    else if (value === '--manifest') args.manifest = argv[++i];
    else if (value === '--folder') args.folder = argv[++i];
  }
  return args;
}

function loadSecret(name) {
  try { return fs.readFileSync(path.join(configDir, name), 'utf8').trim(); } catch { return ''; }
}

function loadProfile() {
  try {
    const profile = JSON.parse(fs.readFileSync(path.join(configDir, 'zju-kb-collaborator.json'), 'utf8'));
    if (profile && profile.name && /^[A-Za-z0-9_-]{2,8}$/.test(profile.id || '')) return profile;
  } catch { /* reported below without disclosing paths or secrets */ }
  fail('collaborator-profile-missing');
}

async function post(scope, operation, body, credentials) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${API_BASE}/${scope}/v1/${operation}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ima-openapi-clientid': credentials.clientId,
        'ima-openapi-apikey': credentials.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.code !== 0) {
      fail(`${scope}/${operation}-failed`);
    }
    return payload.data || {};
  } finally {
    clearTimeout(timer);
  }
}

async function listAll(knowledgeBaseId, folderId, credentials) {
  const rows = [];
  let cursor = '';
  for (let page = 0; page < 30; page += 1) {
    const body = { knowledge_base_id: knowledgeBaseId, cursor, limit: 50 };
    if (folderId) body.folder_id = folderId;
    const data = await post('wiki', 'get_knowledge_list', body, credentials);
    rows.push(...(data.knowledge_list || []));
    if (data.is_end || !data.next_cursor || data.next_cursor === cursor) return rows;
    cursor = data.next_cursor;
  }
  fail('knowledge-list-pagination-limit');
}

function pageTitle(html, fallbackUrl) {
  const text = String(html);
  // ima displays these MkDocs pages by their H1, not by the browser title
  // which includes the site-wide "2026...新生指引" suffix.
  const match = text.match(/<h1[^>]*>\s*([\s\S]*?)\s*<\/h1>/i) || text.match(/<title[^>]*>\s*([\s\S]*?)\s*<\/title>/i);
  const title = match ? match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
  return title || new URL(fallbackUrl).hostname;
}

function pageTitleVariants(html, fallbackUrl) {
  const text = String(html);
  const browser = text.match(/<title[^>]*>\s*([\s\S]*?)\s*<\/title>/i);
  const browserTitle = browser ? browser[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
  // ima sometimes uses the browser title, and sometimes drops its guide/site suffix.
  const withoutGuideSuffix = browserTitle.replace(/\s*-\s*20\d{2}年浙江大学本科新生指引\s*$/u, '').trim();
  return [...new Set([pageTitle(text, fallbackUrl), browserTitle, withoutGuideSuffix].filter(Boolean))];
}

async function inspectHtml(url) {
  let parsed;
  try { parsed = new URL(url); } catch { fail('manifest-has-invalid-url'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) fail('manifest-has-non-http-url');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'ZJU-KB-Ingest/1.0' } });
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!response.ok) fail('source-url-not-reachable');
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) fail('source-url-is-not-html');
    const html = await response.text();
    const titleVariants = pageTitleVariants(html, response.url || url);
    return { title: titleVariants[0], titleVariants, finalUrl: response.url || url };
  } finally {
    clearTimeout(timer);
  }
}

function shanghaiNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter((item) => item.type !== 'literal').map((item) => [item.type, item.value]));
  return { date: `${value.year}-${value.month}-${value.day}`, compactDate: `${value.year}${value.month}${value.day}`, time: `${value.hour}${value.minute}` };
}

function normalizeManifest(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items) || raw.items.length === 0) fail('manifest-needs-nonempty-items');
  const library = raw.knowledgeBase || DEFAULT_LIBRARY;
  const requestedBy = raw.requestedBy || '知识库管理员';
  const seen = new Set();
  const items = raw.items.map((item) => {
    if (!item || typeof item.url !== 'string' || typeof item.folder !== 'string') fail('manifest-item-needs-url-and-folder');
    if (!['官方', '经验', '待处理', '历史资料'].includes(item.status)) fail('manifest-item-has-invalid-status');
    const url = item.url.trim();
    if (seen.has(url)) fail('manifest-repeats-a-url');
    seen.add(url);
    return { url, folder: item.folder.trim(), status: item.status, source: String(item.source || '公开网页').trim(), note: String(item.note || '').trim(), visibleTitle: String(item.visibleTitle || '').trim(), forceImport: item.forceImport === true };
  });
  return { library, requestedBy, items };
}

async function findOwnLog01(profile, credentials) {
  const candidates = [
    `00 LOG 01｜资料登记｜${profile.name}｜${profile.id}`,
    `00 LOG 01｜资料登记｜${profile.name}`,
  ];
  for (const title of candidates) {
    const data = await post('note', 'search_note_book', { search_type: 0, query_info: { title }, start: 0, end: 20 }, credentials);
    const note = (data.docs || []).map((item) => item && item.doc && item.doc.basic_info).find((item) => item && item.title === title && item.docid);
    if (note) return note.docid;
  }
  fail('own-log-01-not-found-run-bootstrap-personal-log-lane');
}

function logEntry(item, title, registrationId, date, requestedBy, profile) {
  return `\n## ${registrationId}｜${date}\n\n资料标题：${title}\n资料类型：网页\n来源：${item.status}（${item.source}）\n原始链接或原始文件名：${item.url}\n初始位置：\`${item.folder}\`\n初始状态：${item.status}\n导入核对：接口成功且目录可见\nAI 检索状态：未验证\n操作发起/授权者：${requestedBy}\n执行者：${profile.name}\n${item.note ? `备注：${item.note}\n` : ''}`;
}

async function main() {
  const args = argsOf(process.argv);
  if (!args.manifest || (args.execute === args.dryRun)) fail('usage-requires-exactly-one-of-dry-run-or-execute');
  const manifest = normalizeManifest(JSON.parse(fs.readFileSync(path.resolve(args.manifest), 'utf8')));
  if (args.folder) {
    manifest.items = manifest.items.filter((item) => item.folder === args.folder);
    if (manifest.items.length === 0) fail('manifest-has-no-items-for-folder');
  }
  const credentials = { clientId: loadSecret('client_id'), apiKey: loadSecret('api_key') };
  if (!credentials.clientId || !credentials.apiKey) fail('ima-credentials-not-configured');
  const profile = loadProfile();
  // 库定位：优先 search_knowledge_base（info_list，共享/管理员角色可见）；addable 列表兜底。
  let library = null;
  const named = await post('wiki', 'search_knowledge_base', { query: manifest.library, cursor: '', limit: 20 }, credentials);
  const namedList = (named && named.info_list) || [];
  library = namedList.find((item) => item && item.kb_name === manifest.library);
  if (!library) {
    const libraries = await post('wiki', 'get_addable_knowledge_base_list', { cursor: '', limit: 50 }, credentials);
    library = (libraries.addable_knowledge_base_list || []).find((item) => item && item.name === manifest.library);
  }
  if (!library) fail('target-library-not-addable');
  library.id = library.id || library.kb_id;

  // These calls do not depend on one another. Parallelizing them keeps a
  // one-folder import responsive without parallelizing any write or log append.
  const [rootItems, inspectedSources, ownLogDocId] = await Promise.all([
    listAll(library.id, null, credentials),
    Promise.all(manifest.items.map((item) => inspectHtml(item.url))),
    args.execute ? findOwnLog01(profile, credentials) : Promise.resolve(null),
  ]);
  const folders = new Map(rootItems.filter((item) => item && item.media_type === 99).map((item) => [item.title, item]));
  const prepared = manifest.items.map((item, index) => {
    const folder = folders.get(item.folder);
    if (!folder) fail('target-folder-missing');
    const source = inspectedSources[index];
    return { ...item, title: source.title, titleVariants: source.titleVariants, finalUrl: source.finalUrl, folderId: folder.media_id };
  });

  const byFolder = new Map();
  for (const item of prepared) {
    if (!byFolder.has(item.folder)) byFolder.set(item.folder, []);
    byFolder.get(item.folder).push(item);
  }
  if ([...byFolder.values()].some((items) => items.length > 10)) fail('manifest-has-more-than-10-urls-in-one-folder');

  const report = { mode: args.dryRun ? 'dry-run' : 'execute', library: manifest.library, planned: prepared.map((item) => ({ url: item.url, title: item.title, folder: item.folder, status: item.status })), skippedDuplicates: [], reconciled: [], imported: [], logEntries: 0, aiRetrieval: '未验证' };
  if (args.debugVisibleTitles) report.visibleTitles = {};
  const importable = [];
  const visibleToRecord = new Map();
  for (const [folderName, items] of byFolder) {
    const visible = await listAll(library.id, items[0].folderId, credentials);
    if (args.debugVisibleTitles) report.visibleTitles[folderName] = visible.map((item) => item && ({
      title: item.title,
      contentId: item.content_id || (item.web_info && item.web_info.content_id) || '',
      fields: Object.keys(item || {}).filter((key) => !['media_id', 'parent_folder_id'].includes(key)),
    })).filter((item) => item && item.title);
    const titles = new Set(visible.map((item) => String(item.title || '').trim()).filter(Boolean));
    for (const item of items) {
      if (args.recordVisible && item.visibleTitle && titles.has(item.visibleTitle)) {
        if (!visibleToRecord.has(folderName)) visibleToRecord.set(folderName, []);
        visibleToRecord.get(folderName).push(item);
      } else if (!item.forceImport && item.titleVariants.some((title) => titles.has(title))) report.skippedDuplicates.push({ url: item.url, title: item.title, folder: folderName, reason: 'same-visible-title' });
      else importable.push(item);
    }
  }
  if (args.dryRun) {
    report.readyToImport = importable.map((item) => ({ url: item.url, title: item.title, folder: item.folder }));
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
    return;
  }

  const logDocId = ownLogDocId;
  const now = shanghaiNow();
  // Separate invocations can land in the same minute. Continue that minute's
  // per-collaborator sequence rather than reusing `...-01`.
  const currentLog = await post('note', 'get_doc_content', { doc_id: logDocId, target_content_format: 0 }, credentials);
  const idPattern = new RegExp(`ZJU-${now.compactDate}-${now.time}-${profile.id}-(\\d{2,})`, 'g');
  let serial = 0;
  for (const match of String(currentLog.content || '').matchAll(idPattern)) serial = Math.max(serial, Number(match[1]) || 0);
  async function appendVerifiedLog(items, folderName, reconciled) {
    if (items.length === 0) return;
    let appendContent = '';
    for (const item of items) {
      serial += 1;
      const registrationId = `ZJU-${now.compactDate}-${now.time}-${profile.id}-${String(serial).padStart(2, '0')}`;
      const recordedTitle = reconciled ? item.visibleTitle : (item.visibleTitle || item.title);
      appendContent += logEntry(item, recordedTitle, registrationId, now.date, manifest.requestedBy, profile);
      const entry = { url: item.url, title: recordedTitle, folder: folderName, status: item.status, registrationId };
      if (reconciled) report.reconciled.push(entry); else report.imported.push(entry);
    }
    await post('note', 'append_doc', { doc_id: logDocId, content_format: 1, content: appendContent }, credentials);
    report.logEntries += items.length;
  }
  for (const [folderName, items] of visibleToRecord) {
    await appendVerifiedLog(items, folderName, true);
  }
  for (const [folderName, items] of byFolder) {
    const reconciledUrls = new Set((visibleToRecord.get(folderName) || []).map((item) => item.url));
    const candidates = items.filter((item) => !reconciledUrls.has(item.url) && !report.skippedDuplicates.some((skip) => skip.url === item.url));
    if (candidates.length === 0) continue;
    const data = await post('wiki', 'import_urls', { knowledge_base_id: library.id, folder_id: candidates[0].folderId, urls: candidates.map((item) => item.url) }, credentials);
    const results = data.results || {};
    const successful = candidates.map((item) => {
      const result = results[item.url] || Object.values(results).find((row) => row && row.url === item.url);
      return result && result.ret_code === 0 ? { ...item, importedMediaId: result.media_id || '' } : null;
    }).filter(Boolean);
    if (successful.length !== candidates.length) fail('url-import-partially-failed');

    let verified = [];
    for (let attempt = 0; attempt < 6 && verified.length !== successful.length; attempt += 1) {
      const visible = await listAll(library.id, candidates[0].folderId, credentials);
      verified = successful.map((item) => {
        const entry = visible.find((candidate) => candidate && (candidate.media_id === item.importedMediaId || item.titleVariants.includes(candidate.title)));
        return entry ? { ...item, visibleTitle: entry.title } : null;
      }).filter(Boolean);
      if (verified.length !== successful.length) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (verified.length !== successful.length) fail('url-import-not-visible-after-retry');

    await appendVerifiedLog(verified, folderName, false);
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.log(JSON.stringify({ completed: false, error: error && error.message ? error.message : 'url-ingest-failed' }));
  process.exitCode = 1;
});
