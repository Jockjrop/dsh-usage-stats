import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

console.log('[Consistency Test] Verifying build output consistency across src, lib, and root...');

const srcIndexHash = sha256(path.join(root, 'src', 'index.js'));
const libIndexHash = sha256(path.join(root, 'lib', 'index.js'));
const rootIndexHash = sha256(path.join(root, 'index.js'));

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const expectedClient = fs.readFileSync(path.join(root, 'src', 'client.js'), 'utf8')
  .replace("var PLUGIN_VERSION = '__DSH_USAGE_STATS_VERSION__'", 'var PLUGIN_VERSION = ' + JSON.stringify(pkg.version));
const srcClientHash = crypto.createHash('sha256').update(expectedClient).digest('hex');
const libClientHash = sha256(path.join(root, 'lib', 'client.js'));
const rootClientHash = sha256(path.join(root, 'client.js'));

const srcQuotasHash = sha256(path.join(root, 'src', 'provider-quotas.js'));
const libQuotasHash = sha256(path.join(root, 'lib', 'provider-quotas.js'));
const rootQuotasHash = sha256(path.join(root, 'provider-quotas.js'));

let failed = false;
for (const file of ['quota-controls.js']) {
  const hash = sha256(path.join(root, 'src', file));
  if (hash !== sha256(path.join(root, 'lib', file)) || hash !== sha256(path.join(root, file))) {
    console.error('Mismatch across src, lib, and root:', file);
    failed = true;
  }
}

if (srcIndexHash !== libIndexHash || srcIndexHash !== rootIndexHash) {
  console.error('❌ Mismatch in index.js across src, lib, and root:');
  console.error('  src: ', srcIndexHash);
  console.error('  lib: ', libIndexHash);
  console.error('  root:', rootIndexHash);
  failed = true;
} else {
  console.log('✅ index.js is 100% consistent across src, lib, and root.');
}

if (srcClientHash !== libClientHash || srcClientHash !== rootClientHash) {
  console.error('❌ Mismatch in client.js across src, lib, and root:');
  console.error('  src: ', srcClientHash);
  console.error('  lib: ', libClientHash);
  console.error('  root:', rootClientHash);
  failed = true;
} else {
  console.log('✅ client.js matches src and package.json in lib and root.');
}

if (srcQuotasHash !== libQuotasHash || srcQuotasHash !== rootQuotasHash) {
  console.error('❌ Mismatch in provider-quotas.js across src, lib, and root.');
  failed = true;
} else {
  console.log('✅ provider-quotas.js is 100% consistent across src, lib, and root.');
}

if (failed) {
  process.exit(1);
} else {
  console.log('🎉 All consistency checks passed successfully!');
}
