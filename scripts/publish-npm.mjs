import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this script through npm run publish:release.');
const archiveName = `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`;
const archivePath = path.join(root, 'release', archiveName);
const integrity = 'sha512-' + createHash('sha512').update(await fs.readFile(archivePath)).digest('base64');
const registry = 'https://registry.npmjs.org/';
const response = await fetch(`${registry}${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`);

if (response.ok) {
  const published = await response.json();
  assert.equal(published.name, pkg.name);
  assert.equal(published.version, pkg.version);
  assert.equal(published.dist?.integrity, integrity, 'This npm version already exists with different package contents.');
  console.log(`${pkg.name}@${pkg.version} is already published with the verified archive; leaving it unchanged.`);
} else {
  assert.equal(response.status, 404, `npm registry lookup failed: HTTP ${response.status}`);
  execFileSync(process.execPath, [npmCli, 'publish', archivePath, '--ignore-scripts', '--access', 'public', '--registry', registry,
    '--tag', pkg.version.includes('-') ? 'next' : 'latest'], { cwd: root, stdio: 'inherit' });
}
