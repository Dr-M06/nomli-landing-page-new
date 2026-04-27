/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMPONENTS_DIR = path.join(ROOT, 'components');

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];
const IGNORE_DIRS = new Set(['node_modules', 'ios', 'android', '.expo', 'dist', 'build']);

function normalizeSlashes(p) {
  return p.replace(/\\/g, '/');
}

function isCodeFile(p) {
  const ext = path.extname(p);
  return CODE_EXTS.includes(ext) && !p.endsWith('.d.ts');
}

function walk(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (IGNORE_DIRS.has(ent.name)) continue;
      out.push(...walk(full));
    } else if (isCodeFile(full)) {
      out.push(full);
    }
  }
  return out;
}

function readTextSafe(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function extractModuleSpecifiers(code) {
  const out = new Set();
  const importExportRe = /\b(?:import|export)\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(importExportRe)) out.add(m[1]);
  const dynamicImportRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of code.matchAll(dynamicImportRe)) out.add(m[1]);
  const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of code.matchAll(requireRe)) out.add(m[1]);
  return out;
}

function resolveRelative(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const fromDir = path.dirname(fromFile);
  const base = path.resolve(fromDir, spec);

  // If spec already has extension
  if (CODE_EXTS.includes(path.extname(base)) && fs.existsSync(base)) return base;

  // Try extensions
  for (const ext of CODE_EXTS) {
    const p = base + ext;
    if (fs.existsSync(p)) return p;
  }

  // Try index.* in folder
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    for (const ext of CODE_EXTS) {
      const p = path.join(base, 'index' + ext);
      if (fs.existsSync(p)) return p;
    }
  }

  return null;
}

function main() {
  if (!fs.existsSync(COMPONENTS_DIR)) {
    console.error('components/ directory not found:', COMPONENTS_DIR);
    process.exit(1);
  }

  const allCodeFiles = walk(ROOT);
  const byPath = new Map();
  for (const f of allCodeFiles) byPath.set(path.resolve(f), f);

  const roots = [];
  const appDir = path.join(ROOT, 'app');
  if (fs.existsSync(appDir)) roots.push(...walk(appDir));
  // Include common entry/config files that can pull components in.
  for (const p of ['index.js', 'app.config.js']) {
    const abs = path.join(ROOT, p);
    if (fs.existsSync(abs) && isCodeFile(abs)) roots.push(abs);
  }

  const reachable = new Set();
  const queue = roots.map(f => path.resolve(f));

  while (queue.length) {
    const file = queue.pop();
    if (!file || reachable.has(file)) continue;
    reachable.add(file);

    const code = readTextSafe(file);
    if (!code) continue;

    for (const spec of extractModuleSpecifiers(code)) {
      const resolved = resolveRelative(file, spec);
      if (resolved && byPath.has(path.resolve(resolved)) && !reachable.has(path.resolve(resolved))) {
        queue.push(path.resolve(resolved));
      }
    }
  }

  const componentFiles = walk(COMPONENTS_DIR).filter(isCodeFile).map(f => path.resolve(f));
  const unreachableComponents = componentFiles
    .filter(f => !reachable.has(f))
    .map(f => normalizeSlashes(path.relative(ROOT, f)))
    .sort();

  console.log(JSON.stringify({ unreachable_components: unreachableComponents }, null, 2));
}

main();

