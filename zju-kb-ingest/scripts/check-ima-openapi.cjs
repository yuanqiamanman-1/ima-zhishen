#!/usr/bin/env node
'use strict';

// Cross-platform credential-presence check. It intentionally never reads values into output.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const configDir = path.join(os.homedir(), '.config', 'ima');
const hasContent = (fileName) => {
  try {
    return fs.statSync(path.join(configDir, fileName)).size > 0;
  } catch {
    return false;
  }
};

const clientIdConfigured = hasContent('client_id');
const apiKeyConfigured = hasContent('api_key');
console.log(JSON.stringify({
  clientIdConfigured,
  apiKeyConfigured,
  ready: clientIdConfigured && apiKeyConfigured,
  nextAction: clientIdConfigured && apiKeyConfigured ? 'run-openapi-preflight' : 'configure-at-ima-agent-interface',
}));
