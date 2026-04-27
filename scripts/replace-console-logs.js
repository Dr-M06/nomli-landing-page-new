#!/usr/bin/env node

/**
 * Script to replace console.log/warn/error with production-safe logger
 * 
 * Usage: node scripts/replace-console-logs.js [--dry-run]
 * 
 * This script:
 * 1. Finds all console.log/warn/error statements
 * 2. Replaces them with productionLogger equivalents
 * 3. Adds import statement if needed
 * 4. Preserves error logging for actual errors
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DRY_RUN = process.argv.includes('--dry-run');
const APP_DIR = path.join(__dirname, '..', 'app');
const COMPONENTS_DIR = path.join(__dirname, '..', 'components');
const UTILS_DIR = path.join(__dirname, '..', 'utils');

// Files to skip (already using production logger or special cases)
const SKIP_FILES = [
  'utils/productionLogger.ts',
  'utils/errorHandler.ts',
  'disableConsoleInProduction.js',
  'scripts',
  'node_modules',
  '.expo',
];

// Patterns to replace
const REPLACEMENTS = [
  {
    pattern: /console\.log\(/g,
    replacement: 'log(',
    importName: 'log',
  },
  {
    pattern: /console\.warn\(/g,
    replacement: 'warn(',
    importName: 'warn',
  },
  {
    pattern: /console\.error\(/g,
    replacement: 'error(',
    importName: 'error',
  },
  {
    pattern: /console\.info\(/g,
    replacement: 'log(',
    importName: 'log',
  },
];

function shouldSkipFile(filePath) {
  return SKIP_FILES.some(skip => filePath.includes(skip));
}

function getRelativePath(filePath) {
  const projectRoot = path.join(__dirname, '..');
  return path.relative(projectRoot, filePath);
}

function calculateImportPath(fromFile, toFile) {
  const fromDir = path.dirname(fromFile);
  const toDir = path.dirname(toFile);
  const relative = path.relative(fromDir, toDir);
  
  // Normalize path separators
  let importPath = relative.replace(/\\/g, '/');
  
  // Add ./ if needed
  if (!importPath.startsWith('.')) {
    importPath = './' + importPath;
  }
  
  // Remove file extension
  importPath = importPath.replace(/\.(ts|tsx|js|jsx)$/, '');
  
  // Ensure it ends with the filename
  if (!importPath.endsWith('/productionLogger')) {
    importPath = importPath + '/productionLogger';
  }
  
  return importPath;
}

function addImport(content, importPath) {
  // Check if import already exists
  if (content.includes('from') && content.includes('productionLogger')) {
    return content;
  }
  
  // Find the last import statement
  // IMPORTANT: Match complete import statements, including multi-line imports
  const importRegex = /^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm;
  const imports = content.match(importRegex) || [];
  
  // Also check for incomplete multi-line imports (import { ... } from ...)
  // We need to find where imports end, not just single-line imports
  let lastImportEnd = 0;
  const lines = content.split('\n');
  let inMultiLineImport = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('import ')) {
      // Check if it's a complete single-line import
      if (line.includes(' from ') && line.includes("'") || line.includes('"')) {
        lastImportEnd = content.indexOf(line) + line.length;
      } else if (line.trim() === 'import {' || line.trim().startsWith('import {')) {
        // Start of multi-line import
        inMultiLineImport = true;
      }
    }
    
    // End of multi-line import
    if (inMultiLineImport && (line.trim().startsWith('} from ') || line.trim() === '}')) {
      lastImportEnd = content.indexOf(line) + line.length;
      inMultiLineImport = false;
    }
  }
  
  if (imports.length === 0 && lastImportEnd === 0) {
    // No imports, add at the top
    return `import { log, warn, error } from '${importPath}';\n${content}`;
  }
  
  // Check if productionLogger is already imported
  const hasProductionLogger = content.includes('productionLogger');
  if (hasProductionLogger) {
    // Update existing import
    const existingImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]*productionLogger[^'"]*)['"]/);
    if (existingImportMatch) {
      const existingImports = existingImportMatch[1].split(',').map(i => i.trim());
      const neededImports = ['log', 'warn', 'error'].filter(i => !existingImports.includes(i));
      if (neededImports.length > 0) {
        const newImport = existingImportMatch[0].replace(
          /\{([^}]+)\}/,
          `{${existingImportMatch[1]}, ${neededImports.join(', ')}}`
        );
        return content.replace(existingImportMatch[0], newImport);
      }
    }
    return content;
  }
  
  // Add new import after the last import (complete or multi-line)
  const insertPosition = lastImportEnd > 0 ? lastImportEnd : 
    (imports.length > 0 ? content.lastIndexOf(imports[imports.length - 1]) + imports[imports.length - 1].length : 0);
  
  // Find the end of the line to insert after
  let insertIndex = insertPosition;
  while (insertIndex < content.length && content[insertIndex] !== '\n') {
    insertIndex++;
  }
  insertIndex++; // Include the newline
  
  const newImport = `import { log, warn, error } from '${importPath}';\n`;
  return content.slice(0, insertIndex) + newImport + content.slice(insertIndex);
}

function processFile(filePath) {
  if (shouldSkipFile(filePath)) {
    return { skipped: true };
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = getRelativePath(filePath);
  let modified = content;
  let changes = [];
  
  // Check if file uses console statements
  const hasConsoleLog = /console\.(log|warn|error|info)\(/.test(content);
  if (!hasConsoleLog) {
    return { skipped: true, reason: 'No console statements' };
  }
  
  // Calculate import path
  const loggerPath = path.join(__dirname, '..', 'utils', 'productionLogger.ts');
  const importPath = calculateImportPath(filePath, loggerPath);
  
  // Replace console statements
  for (const { pattern, replacement, importName } of REPLACEMENTS) {
    if (pattern.test(modified)) {
      modified = modified.replace(pattern, replacement);
      changes.push(`Replaced console.${importName} with ${importName}`);
    }
  }
  
  // Add import if needed
  if (modified !== content) {
    modified = addImport(modified, importPath);
  }
  
  if (modified !== content) {
    if (!DRY_RUN) {
      fs.writeFileSync(filePath, modified, 'utf8');
    }
    return { modified: true, changes, relativePath };
  }
  
  return { skipped: true };
}

function findFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!shouldSkipFile(filePath)) {
        findFiles(filePath, fileList);
      }
    } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

function main() {
  console.log('🔍 Finding files with console statements...\n');
  
  const files = [
    ...findFiles(APP_DIR),
    ...findFiles(COMPONENTS_DIR),
    ...findFiles(UTILS_DIR),
  ];
  
  console.log(`Found ${files.length} files to check\n`);
  
  const results = {
    modified: [],
    skipped: [],
  };
  
  files.forEach(file => {
    const result = processFile(file);
    if (result.modified) {
      results.modified.push(result);
      console.log(`✅ ${result.relativePath}`);
      result.changes.forEach(change => console.log(`   ${change}`));
    } else if (!result.skipped) {
      results.skipped.push(result);
    }
  });
  
  console.log(`\n📊 Summary:`);
  console.log(`   Modified: ${results.modified.length} files`);
  console.log(`   Skipped: ${results.skipped.length} files`);
  
  if (DRY_RUN) {
    console.log(`\n⚠️  DRY RUN MODE - No files were modified`);
    console.log(`   Run without --dry-run to apply changes`);
  } else {
    console.log(`\n✅ Changes applied!`);
    console.log(`   Review the changes and test your app`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { processFile, findFiles };
