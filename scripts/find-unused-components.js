/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMPONENTS_DIR = path.join(ROOT, 'components');

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const IGNORE_DIRS = new Set([
  'node_modules',
  'ios',
  'android',
  '.expo',
  '.web-stubs',
  'dist',
  'build',
]);

function walk(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (IGNORE_DIRS.has(ent.name)) continue;
      out.push(...walk(full));
    } else {
      const ext = path.extname(ent.name);
      if (SOURCE_EXTS.has(ext)) out.push(full);
    }
  }
  return out;
}

function walkComponents(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walkComponents(full));
    } else {
      const ext = path.extname(ent.name);
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) continue;
      if (ent.name === 'index.ts' || ent.name === 'index.tsx') {
        out.push(full);
        continue;
      }
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

function normalizeSlashes(p) {
  return p.replace(/\\/g, '/');
}

function componentImportKeys(componentAbsPath) {
  const relFromRoot = normalizeSlashes(path.relative(ROOT, componentAbsPath));
  const relNoExt = relFromRoot.replace(/\.(ts|tsx|js|jsx)$/, '');

  // We match common import styles:
  // - '../../../components/Foo'
  // - '../components/Foo'
  // - './components/Foo' (rare)
  // - 'components/Foo' (rare)
  const relFromComponents = normalizeSlashes(path.relative(COMPONENTS_DIR, componentAbsPath)).replace(/\.(ts|tsx|js|jsx)$/, '');
  return {
    relFromRoot,
    relNoExt,
    relFromComponents,
    baseName: path.basename(relNoExt),
  };
}

function extractModuleSpecifiers(code) {
  const out = new Set();

  // import ... from 'x'
  // export ... from 'x'
  const importExportRe = /\b(?:import|export)\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(importExportRe)) out.add(m[1]);

  // import('x')
  const dynamicImportRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of code.matchAll(dynamicImportRe)) out.add(m[1]);

  // require('x')
  const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of code.matchAll(requireRe)) out.add(m[1]);

  return out;
}

function main() {
  if (!fs.existsSync(COMPONENTS_DIR)) {
    console.error('components/ directory not found:', COMPONENTS_DIR);
    process.exit(1);
  }

  const sourceFiles = walk(ROOT);
  const allSpecifiers = new Set();
  const allText = [];
  for (const f of sourceFiles) {
    const code = readTextSafe(f);
    if (!code) continue;
    for (const s of extractModuleSpecifiers(code)) allSpecifiers.add(s);
    allText.push(code);
  }
  const fullText = allText.join('\n');

  const componentFiles = walkComponents(COMPONENTS_DIR)
    .filter(f => !/\.d\.ts$/.test(f));

  const unused = [];

  for (const file of componentFiles) {
    const keys = componentImportKeys(file);

    const candidates = [
      // exact specifiers seen in code
      `./${keys.relNoExt}`,
      `../${keys.relNoExt}`,
      `../../${keys.relNoExt}`,
      `../../../${keys.relNoExt}`,
      `../../../../${keys.relNoExt}`,
      keys.relNoExt,
      `./${keys.relFromRoot.replace(/\.(ts|tsx|js|jsx)$/, '')}`,
      keys.relFromRoot.replace(/\.(ts|tsx|js|jsx)$/, ''),
      `./${keys.relFromRoot}`,
      keys.relFromRoot,
      `components/${keys.relFromComponents}`,
      `./components/${keys.relFromComponents}`,
      `../components/${keys.relFromComponents}`,
      `../../components/${keys.relFromComponents}`,
      `../../../components/${keys.relFromComponents}`,
      `../../../../components/${keys.relFromComponents}`,
    ].map(normalizeSlashes);

    const isUsed = candidates.some(c => allSpecifiers.has(c));

    // Extra safety: if filename appears anywhere, treat as used (catches re-exports, strings, docs)
    const basenameMentioned = fullText.includes(keys.baseName);

    if (!isUsed && !basenameMentioned) {
      unused.push(normalizeSlashes(path.relative(ROOT, file)));
    }
  }

  unused.sort();
  console.log(JSON.stringify({ unused_components: unused }, null, 2));
}

main();

