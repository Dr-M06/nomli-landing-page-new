#!/usr/bin/env node

/**
 * Fix productionLogger import path typos
 * Changes .//productionLogger to ./productionLogger
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');

function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fixed = content.replace(/\.\/\/productionLogger/g, './productionLogger');
  
  if (content !== fixed) {
    fs.writeFileSync(filePath, fixed, 'utf8');
    return true;
  }
  return false;
}

function findFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findFiles(filePath, fileList);
    } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

function main() {
  console.log('🔧 Fixing productionLogger import paths...\n');
  
  const files = findFiles(path.join(PROJECT_ROOT, 'utils'));
  const appFiles = findFiles(path.join(PROJECT_ROOT, 'app'));
  const componentFiles = findFiles(path.join(PROJECT_ROOT, 'components'));
  
  const allFiles = [...files, ...appFiles, ...componentFiles];
  
  let fixedCount = 0;
  
  allFiles.forEach(file => {
    if (fixFile(file)) {
      const relativePath = path.relative(PROJECT_ROOT, file);
      console.log(`✅ Fixed: ${relativePath}`);
      fixedCount++;
    }
  });
  
  console.log(`\n📊 Fixed ${fixedCount} files`);
}

if (require.main === module) {
  main();
}

module.exports = { fixFile };
