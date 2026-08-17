#!/usr/bin/env node
'use strict';

// File branch of ingest.cjs. Credentials and temporary COS credentials never
// appear in output, logs, manifests, or copied filenames.

const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');

const API_BASE = 'https://ima.qq.com/openapi';
const KB_NAME = '浙大校园信息站';
const configDir = path.join(os.homedir(), '.config', 'ima');
const TYPES = {
  pdf: [1, 'application/pdf'], doc: [3, 'application/msword'], docx: [3, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ppt: [4, 'application/vnd.ms-powerpoint'], pptx: [4, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  xls: [5, 'application/vnd.ms-excel'], xlsx: [5, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], csv: [5, 'text/csv'],
  md: [7, 'text/markdown'], markdown: [7, 'text/markdown'], png: [9, 'image/png'], jpg: [9, 'image/jpeg'], jpeg: [9, 'image/jpeg'], webp: [9, 'image/webp'],
  txt: [13, 'text/plain'], xmind: [14, 'application/x-xmind'], mp3: [15, 'audio/mpeg'], m4a: [15, 'audio/x-m4a'], wav: [15, 'audio/wav'], aac: [15, 'audio/aac'],
};
const LIMIT = { 5: 10 * 1024 * 1024, 7: 10 * 1024 * 1024, 9: 30 * 1024 * 1024, 13: 10 * 1024 * 1024, 14: 10 * 1024 * 1024 };

function fail(message) { throw new Error(message); }
function parse(argv) { const args = { execute: false, dryRun: false }; for (let i = 2; i < argv.length; i += 1) { const token = argv[i]; if (token === '--execute') args.execute = true; else if (token === '--dry-run') args.dryRun = true; else if (token.startsWith('--')) args[token.slice(2)] = argv[++i]; } return args; }
function secret(name) { try { return fs.readFileSync(path.join(configDir, name), 'utf8').trim(); } catch { return ''; } }
function profile() { try { const value = JSON.parse(fs.readFileSync(path.join(configDir, 'zju-kb-collaborator.json'), 'utf8')); if (value.name && /^[A-Za-z0-9_-]{2,8}$/.test(value.id || '')) return value; } catch {} fail('collaborator-profile-missing'); }

async function post(scope, operation, body, credentials) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE}/${scope}/v1/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'ima-openapi-clientid': credentials.clientId, 'ima-openapi-apikey': credentials.apiKey }, body: JSON.stringify(body), signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.code !== 0) fail(`${scope}/${operation}-failed`);
    return payload.data || {};
  } finally { clearTimeout(timer); }
}
async function listAll(kbId, folderId, credentials) { const list = []; let cursor = ''; for (let page = 0; page < 30; page += 1) { const body = { knowledge_base_id: kbId, cursor, limit: 50 }; if (folderId) body.folder_id = folderId; const data = await post('wiki', 'get_knowledge_list', body, credentials); list.push(...(data.knowledge_list || [])); if (data.is_end || !data.next_cursor || data.next_cursor === cursor) return list; cursor = data.next_cursor; } fail('knowledge-list-pagination-limit'); }
async function ownLog01(person, credentials) { for (const title of [`00 LOG 01｜资料登记｜${person.name}｜${person.id}`, `00 LOG 01｜资料登记｜${person.name}`]) { const data = await post('note', 'search_note_book', { search_type: 0, query_info: { title }, start: 0, end: 20 }, credentials); const found = (data.docs || []).map((entry) => entry && entry.doc && entry.doc.basic_info).find((entry) => entry && entry.title === title && entry.docid); if (found) return found.docid; } fail('own-log-01-not-found-run-bootstrap-personal-log-lane'); }
function shanghaiNow() { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])); return { date: `${value.year}-${value.month}-${value.day}`, compact: `${value.year}${value.month}${value.day}`, time: `${value.hour}${value.minute}` }; }
function hmac(key, value) { return crypto.createHmac('sha1', key).update(value).digest('hex'); }
function sha(value) { return crypto.createHash('sha1').update(value).digest('hex'); }
function cosAuthorization(credential, host, size) { const start = String(credential.start_time || Math.floor(Date.now() / 1000)); const expiry = String(credential.expired_time || Math.floor(Date.now() / 1000) + 3600); const keyTime = `${start};${expiry}`; const signKey = hmac(credential.secret_key, keyTime); const headers = `content-length=${encodeURIComponent(String(size))}&host=${encodeURIComponent(host)}`; const httpString = `put\n/${credential.cos_key}\n\n${headers}\n`; const toSign = `sha1\n${keyTime}\n${sha(httpString)}\n`; return `q-sign-algorithm=sha1&q-ak=${credential.secret_id}&q-sign-time=${keyTime}&q-key-time=${keyTime}&q-header-list=content-length;host&q-url-param-list=&q-signature=${hmac(signKey, toSign)}`; }
function cosUpload(filePath, contentType, credential) { return new Promise((resolve, reject) => { const content = fs.readFileSync(filePath); const host = `${credential.bucket_name}.cos.${credential.region}.myqcloud.com`; const request = https.request({ hostname: host, path: `/${credential.cos_key}`, method: 'PUT', headers: { 'Content-Type': contentType, 'Content-Length': content.length, Authorization: cosAuthorization(credential, host, content.length), 'x-cos-security-token': credential.token } }, (response) => { response.resume(); response.on('end', () => response.statusCode >= 200 && response.statusCode < 300 ? resolve() : reject(new Error('cos-upload-failed'))); }); request.on('error', () => reject(new Error('cos-upload-failed'))); request.end(content); }); }

async function main() {
  const args = parse(process.argv);
  if (!args.file || !args.folder || !args.status || !args.source || (args.execute === args.dryRun)) fail('usage-requires-file-folder-status-source-and-mode');
  if (!['官方', '经验', '待处理', '历史资料'].includes(args.status)) fail('invalid-status');
  const sourcePath = path.resolve(args.file); if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) fail('source-file-not-found');
  const uploadName = args['upload-name'] || path.basename(sourcePath); const ext = path.extname(uploadName).slice(1).toLowerCase(); const type = TYPES[ext]; if (!type) fail('unsupported-file-type');
  const stat = fs.statSync(sourcePath); if (stat.size > (LIMIT[type[0]] || 200 * 1024 * 1024)) fail('file-exceeds-size-limit');
  const credentials = { clientId: secret('client_id'), apiKey: secret('api_key') }; if (!credentials.clientId || !credentials.apiKey) fail('ima-credentials-not-configured');
  const person = profile(); const libraries = await post('wiki', 'get_addable_knowledge_base_list', { cursor: '', limit: 50 }, credentials); const library = (libraries.addable_knowledge_base_list || []).find((item) => item && item.name === KB_NAME); if (!library) fail('target-library-not-addable');
  const root = await listAll(library.id, null, credentials); const folder = root.find((item) => item && item.media_type === 99 && item.title === args.folder); if (!folder) fail('target-folder-missing');
  const repeated = await post('wiki', 'check_repeated_names', { knowledge_base_id: library.id, folder_id: folder.media_id, params: [{ name: uploadName, media_type: type[0] }] }, credentials); const duplicate = (repeated.results || []).some((item) => item && item.is_repeated);
  const report = { mode: args.dryRun ? 'dry-run' : 'execute', type: 'file', file: uploadName, folder: args.folder, status: args.status, duplicate, imported: false, logEntries: 0, aiRetrieval: '未验证' };
  if (args.dryRun || duplicate) { console.log(JSON.stringify(report, null, 2)); return; }
  const logDocId = await ownLog01(person, credentials); const media = await post('wiki', 'create_media', { file_name: uploadName, file_size: stat.size, content_type: type[1], knowledge_base_id: library.id, file_ext: ext }, credentials);
  await cosUpload(sourcePath, type[1], media.cos_credential);
  await post('wiki', 'add_knowledge', { media_type: type[0], media_id: media.media_id, title: uploadName, knowledge_base_id: library.id, folder_id: folder.media_id, file_info: { cos_key: media.cos_credential.cos_key, file_size: stat.size, last_modify_time: Math.floor(stat.mtimeMs / 1000), password: '', file_name: uploadName } }, credentials);
  let visible = false; for (let attempt = 0; attempt < 6 && !visible; attempt += 1) { visible = (await listAll(library.id, folder.media_id, credentials)).some((item) => item && (item.media_id === media.media_id || item.title === uploadName)); if (!visible) await new Promise((resolve) => setTimeout(resolve, 1000)); }
  if (!visible) fail('file-import-not-visible-after-retry');
  const now = shanghaiNow(); const current = await post('note', 'get_doc_content', { doc_id: logDocId, target_content_format: 0 }, credentials); const pattern = new RegExp(`ZJU-${now.compact}-${now.time}-${person.id}-(\\d{2,})`, 'g'); let serial = 0; for (const match of String(current.content || '').matchAll(pattern)) serial = Math.max(serial, Number(match[1]) || 0); const id = `ZJU-${now.compact}-${now.time}-${person.id}-${String(serial + 1).padStart(2, '0')}`;
  const text = `\n## ${id}｜${now.date}\n\n资料标题：${uploadName}\n资料类型：文件\n来源：${args.status}（${args.source}）\n原始链接或原始文件名：${path.basename(sourcePath)}\n初始位置：\`${args.folder}\`\n初始状态：${args.status}\n导入核对：接口成功且目录可见\nAI 检索状态：未验证\n操作发起/授权者：${args['requested-by'] || '知识库管理员'}\n执行者：${person.name}\n${args.note ? `备注：${args.note}\n` : ''}`;
  await post('note', 'append_doc', { doc_id: logDocId, content_format: 1, content: text }, credentials); report.imported = true; report.registrationId = id; report.logEntries = 1; console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => { console.log(JSON.stringify({ completed: false, error: error && error.message ? error.message : 'file-ingest-failed' })); process.exitCode = 1; });
