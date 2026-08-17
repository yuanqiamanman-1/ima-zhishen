#!/usr/bin/env node
'use strict';

// The only collaborator-facing command. It routes a URL or local file to the
// appropriate ima API implementation; users never need to choose a script.

const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function parse(argv) {
  const args = { execute: false, dryRun: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--execute') args.execute = true;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token.startsWith('--')) args[token.slice(2)] = argv[++index];
  }
  return args;
}

function usage() {
  console.log('Usage: node ingest.cjs (--url <URL> | --file <PATH> | --native-note <MARKDOWN_PATH>) --folder <INDEX目录> --status <官方|经验|待处理|历史资料> --source <来源说明> [--requested-by <姓名>] [--note <说明>] --dry-run|--execute');
}

function run(script, args) {
  const result = childProcess.spawnSync(process.execPath, [path.join(__dirname, script), ...args], { stdio: 'inherit' });
  return result.status === null ? 1 : result.status;
}

const args = parse(process.argv);
const inputCount = Number(Boolean(args.url)) + Number(Boolean(args.file)) + Number(Boolean(args['native-note']));
if (!args.folder || !args.status || !args.source || (args.execute === args.dryRun) || inputCount !== 1) {
  usage();
  process.exit(2);
}
const mode = args.execute ? '--execute' : '--dry-run';
if (args['native-note']) {
  process.exit(run('ingest-native-note.cjs', ['--native-note', args['native-note'], '--folder', args.folder, '--status', args.status, '--source', args.source, '--requested-by', args['requested-by'] || '知识库管理员', mode]));
}
if (args.file) {
  process.exit(run('ingest-file.cjs', ['--file', args.file, '--folder', args.folder, '--status', args.status, '--source', args.source, '--requested-by', args['requested-by'] || '知识库管理员', '--note', args.note || '', mode, ...(args['upload-name'] ? ['--upload-name', args['upload-name']] : [])]));
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zju-kb-url-'));
const manifest = path.join(directory, 'request.json');
try {
  fs.writeFileSync(manifest, JSON.stringify({
    knowledgeBase: '浙大校园信息站',
    requestedBy: args['requested-by'] || '知识库管理员',
    items: [{ url: args.url, folder: args.folder, status: args.status, source: args.source, note: args.note || '' }],
  }), 'utf8');
  process.exitCode = run('ingest-url-batch.cjs', ['--manifest', manifest, mode]);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
