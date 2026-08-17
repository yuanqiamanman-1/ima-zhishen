#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const profilePath = path.join(os.homedir(), '.config', 'ima', 'zju-kb-collaborator.json');
try {
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  const ready = typeof profile.name === 'string' && profile.name.trim().length > 0 && /^[A-Za-z0-9_-]{2,8}$/.test(profile.id || '');
  console.log(JSON.stringify(ready ? { ready: true, name: profile.name, id: profile.id } : { ready: false }));
} catch {
  console.log(JSON.stringify({ ready: false }));
}
