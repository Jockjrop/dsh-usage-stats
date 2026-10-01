import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this script through npm run release.');
assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
if (process.env.GITHUB_REF_TYPE === 'tag') {
  assert.equal(process.env.GITHUB_REF_NAME, `v${pkg.version}`, 'Release tag must match package.json.');
}

await import('./build.mjs');
const outputDir = path.join(root, 'release');
await fs.mkdir(outputDir, { recursive: true });
const packResult = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', outputDir], {
  cwd: root,
  encoding: 'utf8',
}));
// npm 12 keys pack results by package name; earlier npm versions return an array.
const packed = Array.isArray(packResult) ? packResult.find(result => result.name === pkg.name) : packResult[pkg.name] ?? packResult;
assert.ok(packed?.filename, 'npm pack did not return package metadata.');
const archiveName = `${pkg.name}-${pkg.version}.tgz`;
assert.equal(packed.filename, archiveName);
const members = new Set(packed.files.map(file => file.path));
for (const member of ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'lib/provider-quotas.js', 'lib/quota-controls.js']) {
  assert.ok(members.has(member), `Release is missing ${member}.`);
}
assert.ok([...members].every(member => !/^(?:src|test|scripts|node_modules|storages|credentials)\//.test(member)), 'Release must contain prebuilt public files only.');

const archivePath = path.join(outputDir, archiveName);
const aliasName = `${pkg.name}.tgz`;
const bytes = await fs.readFile(archivePath);
const digest = createHash('sha256').update(bytes).digest('hex');
await fs.writeFile(path.join(outputDir, aliasName), bytes);
await fs.writeFile(path.join(outputDir, 'SHA256SUMS'), `${digest}  ${archiveName}\n${digest}  ${aliasName}\n`);

// Exercise a consumer installation with scripts disabled and no DSH credentials.
const smokeDir = await fs.mkdtemp(path.join(tmpdir(), 'dsh-usage-stats-release-'));
try {
  await fs.writeFile(path.join(smokeDir, 'package.json'), JSON.stringify({
    name: 'dsh-release-smoke',
    private: true,
    dsh: { profile: { bundles: ['existing-bundle'] } },
  }));
  execFileSync(process.execPath, [npmCli, 'install', '--prefix', smokeDir, '--ignore-scripts', '--no-audit', '--no-fund', archivePath], {
    cwd: root,
    stdio: 'pipe',
  });
  const installedRoot = path.join(smokeDir, 'node_modules', pkg.name);
  const installed = JSON.parse(await fs.readFile(path.join(installedRoot, 'package.json'), 'utf8'));
  assert.equal(installed.version, pkg.version);
  assert.equal(installed.main, 'lib/index.js');
  assert.equal(installed.dsh.client.platform, 'web');
  await fs.access(path.join(installedRoot, installed.dsh.bundle.patch));
  const host = await import(pathToFileURL(path.join(installedRoot, installed.main)).href);
  assert.equal(host.name, 'usage-stats');
  assert.equal(typeof host.apply, 'function');
  let client;
  vm.runInNewContext(await fs.readFile(path.join(installedRoot, installed.exports['./client']), 'utf8'), {
    window: { __ModuleLoader__: { load(definition) { client = definition; } } },
  }, { timeout: 5000 });
  assert.equal(client.id, 'dsh-usage-stats');
  assert.equal(typeof client.factory, 'function');
  const profile = JSON.parse(await fs.readFile(path.join(smokeDir, 'package.json'), 'utf8'));
  assert.deepEqual(profile.dsh.profile.bundles, ['existing-bundle']);
} finally {
  // Validate the exact temporary directory before recursive cleanup on Windows.
  assert.equal(path.dirname(path.resolve(smokeDir)), path.resolve(tmpdir()));
  assert.ok(path.basename(smokeDir).startsWith('dsh-usage-stats-release-'));
  await fs.rm(smokeDir, { recursive: true, force: true });
}

await fs.writeFile(path.join(outputDir, 'RELEASE_NOTES.txt'), `用量统计 ${pkg.version}\n\n预构建的 DSH Desktop 插件：Token 用量趋势、供应商配额与余额、自动刷新和自定义配额查询。\n\n安装：在 DSH 桌面端主界面侧栏进入「插件 → 添加插件」，粘贴以下地址，安装后点击「立即启用」：\n\nhttps://github.com/Jockjrop/dsh-usage-stats/releases/download/v${pkg.version}/${archiveName}\n\n面板入口：设置 → 用量统计。此版本仅支持 desktop profile。\n\nPrebuilt DSH Desktop plugin. In Plugins → Add plugin, paste the archive URL above, install, and select Enable now. No Git checkout or build step is required.\n\nAssets: versioned package, latest-download alias, and SHA256SUMS. Both archives contain identical prebuilt modules; installation was verified with lifecycle scripts disabled.\n`);
console.log(`Release ${pkg.version}: built modules, package installation and renderer entry verified.`);
console.log(`  release/${archiveName}\n  release/${aliasName}\n  release/SHA256SUMS`);
