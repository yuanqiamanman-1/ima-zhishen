#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = {};
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key || !value || !key.startsWith('--')) continue;
  args[key.slice(2)] = value.trim();
}

if (!args.name || !/^[A-Za-z0-9_-]{2,8}$/.test(args.id || '')) {
  console.error('Usage: node save-zju-collaborator-profile.cjs --name <日志显示名> --id <2-8-char-id>');
  process.exit(2);
}

const configDir = path.join(os.homedir(), '.config', 'ima');
const profilePath = path.join(configDir, 'zju-kb-collaborator.json');
fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(profilePath, `${JSON.stringify({ name: args.name, id: args.id }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
console.log(JSON.stringify({ saved: true, name: args.name, id: args.id }));
