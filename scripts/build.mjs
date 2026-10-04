import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

console.log('[Build Pipeline] Building dsh-usage-stats from canonical src/ files...');

const srcIndex = path.join(root, 'src', 'index.js');
const srcClient = path.join(root, 'src', 'client.js');
const srcProviderQuotas = path.join(root, 'src', 'provider-quotas.js');
const srcQuotaControls = path.join(root, 'src', 'quota-controls.js');
const srcModelMatch = path.join(root, 'src', 'model-match.js');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const clientTemplate = fs.readFileSync(srcClient, 'utf8');
const versionMarker = "var PLUGIN_VERSION = '__DSH_USAGE_STATS_VERSION__'";
const packageMarker = "id: '__DSH_USAGE_STATS_PACKAGE__'";
if (!clientTemplate.includes(versionMarker) || typeof pkg.version !== 'string' || !pkg.version) {
  throw new Error('The client version marker or package version is missing.');
}
if (!clientTemplate.includes(packageMarker) || typeof pkg.name !== 'string' || !pkg.name) {
  throw new Error('The client package marker or package name is missing.');
}
const client = clientTemplate
  .replace(versionMarker, 'var PLUGIN_VERSION = ' + JSON.stringify(pkg.version))
  .replace(packageMarker, 'id: ' + JSON.stringify(pkg.name));

if (![srcIndex, srcClient, srcProviderQuotas, srcQuotaControls, srcModelMatch].every(file => fs.existsSync(file))) {
  console.error('Error: required src/ file does not exist.');
  process.exit(1);
}

// 1. Ensure lib/ directory exists
const libDir = path.join(root, 'lib');
if (!fs.existsSync(libDir)) {
  fs.mkdirSync(libDir, { recursive: true });
}

// 2. Copy to lib/ (used by package exports)
fs.copyFileSync(srcIndex, path.join(libDir, 'index.js'));
fs.writeFileSync(path.join(libDir, 'client.js'), client);
fs.copyFileSync(srcProviderQuotas, path.join(libDir, 'provider-quotas.js'));
fs.copyFileSync(srcQuotaControls, path.join(libDir, 'quota-controls.js'));
fs.copyFileSync(srcModelMatch, path.join(libDir, 'model-match.js'));

// 3. Copy to root (used by legacy / direct references)
fs.copyFileSync(srcIndex, path.join(root, 'index.js'));
fs.writeFileSync(path.join(root, 'client.js'), client);
fs.copyFileSync(srcProviderQuotas, path.join(root, 'provider-quotas.js'));
fs.copyFileSync(srcQuotaControls, path.join(root, 'quota-controls.js'));
fs.copyFileSync(srcModelMatch, path.join(root, 'model-match.js'));
for (const file of ['model-fingerprints.js', 'model-capabilities.js', 'model-test-history.js']) {
  fs.copyFileSync(path.join(root, 'src', file), path.join(libDir, file));
  fs.copyFileSync(path.join(root, 'src', file), path.join(root, file));
}
fs.cpSync(path.join(root, 'src', 'fingerprints'), path.join(libDir, 'fingerprints'), { recursive: true });
fs.cpSync(path.join(root, 'src', 'fingerprints'), path.join(root, 'fingerprints'), { recursive: true });

console.log('[Build Pipeline] ✅ Production build completed successfully!');
console.log('  - src/index.js -> lib/index.js & index.js');
console.log('  - src/client.js -> lib/client.js & client.js');
console.log('  - src/provider-quotas.js -> lib/provider-quotas.js & provider-quotas.js');
console.log('  - src/quota-controls.js -> lib/quota-controls.js & quota-controls.js');
console.log('  - src/model-match.js -> lib/model-match.js & model-match.js');
