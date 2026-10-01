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

if (!fs.existsSync(srcIndex) || !fs.existsSync(srcClient) || !fs.existsSync(srcProviderQuotas) || !fs.existsSync(srcQuotaControls)) {
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
fs.copyFileSync(srcClient, path.join(libDir, 'client.js'));
fs.copyFileSync(srcProviderQuotas, path.join(libDir, 'provider-quotas.js'));
fs.copyFileSync(srcQuotaControls, path.join(libDir, 'quota-controls.js'));

// 3. Copy to root (used by legacy / direct references)
fs.copyFileSync(srcIndex, path.join(root, 'index.js'));
fs.copyFileSync(srcClient, path.join(root, 'client.js'));
fs.copyFileSync(srcProviderQuotas, path.join(root, 'provider-quotas.js'));
fs.copyFileSync(srcQuotaControls, path.join(root, 'quota-controls.js'));

console.log('[Build Pipeline] ✅ Production build completed successfully!');
console.log('  - src/index.js -> lib/index.js & index.js');
console.log('  - src/client.js -> lib/client.js & client.js');
console.log('  - src/provider-quotas.js -> lib/provider-quotas.js & provider-quotas.js');
console.log('  - src/quota-controls.js -> lib/quota-controls.js & quota-controls.js');
