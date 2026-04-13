#!/usr/bin/env node

/**
 * Codebase Analysis Script
 * Helps identify refactoring opportunities
 */

const fs = require('fs');
const path = require('path');

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const EXCLUDE_DIRS = ['node_modules', '.expo', 'ios', 'android', '.git', 'dist', 'build'];

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(file)) {
        getAllFiles(filePath, fileList);
      }
    } else {
      const ext = path.extname(file);
      if (EXTENSIONS.includes(ext)) {
        fileList.push(filePath);
      }
    }
  });
  
  return fileList;
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const lineCount = lines.length;
  
  // Count various metrics
  const functionCount = (content.match(/function\s+\w+|const\s+\w+\s*=\s*\(|const\s+\w+\s*=\s*async\s*\(/g) || []).length;
  const importCount = (content.match(/^import\s+/gm) || []).length;
  const exportCount = (content.match(/^export\s+/gm) || []).length;
  const useStateCount = (content.match(/useState/g) || []).length;
  const useEffectCount = (content.match(/useEffect/g) || []).length;
  const consoleCount = (content.match(/console\.(log|warn|error|info|debug)/g) || []).length;
  
  // Estimate complexity (simple heuristic)
  const ifStatements = (content.match(/\bif\s*\(/g) || []).length;
  const forLoops = (content.match(/\bfor\s*\(/g) || []).length;
  const whileLoops = (content.match(/\bwhile\s*\(/g) || []).length;
  const complexity = ifStatements + forLoops + whileLoops + functionCount;
  
  return {
    path: filePath,
    lines: lineCount,
    functions: functionCount,
    imports: importCount,
    exports: exportCount,
    useState: useStateCount,
    useEffect: useEffectCount,
    console: consoleCount,
    complexity,
    needsRefactoring: lineCount > 500 || complexity > 50 || functionCount > 20,
  };
}

function analyzeCodebase() {
  const rootDir = process.cwd();
  const files = getAllFiles(rootDir);
  
  console.log(`\n📊 Analyzing ${files.length} files...\n`);
  
  const analysis = files.map(analyzeFile);
  
  // Sort by lines (largest first)
  const sortedByLines = [...analysis].sort((a, b) => b.lines - a.lines);
  
  // Sort by complexity
  const sortedByComplexity = [...analysis].sort((a, b) => b.complexity - a.complexity);
  
  // Find files needing refactoring
  const needsRefactoring = analysis.filter(f => f.needsRefactoring);
  
  console.log('🔴 Files Needing Refactoring:');
  console.log('='.repeat(80));
  needsRefactoring.slice(0, 20).forEach(file => {
    console.log(`${file.path}`);
    console.log(`  Lines: ${file.lines} | Functions: ${file.functions} | Complexity: ${file.complexity}`);
    console.log('');
  });
  
  console.log('\n📏 Largest Files:');
  console.log('='.repeat(80));
  sortedByLines.slice(0, 10).forEach(file => {
    console.log(`${file.lines.toString().padStart(6)} lines: ${file.path}`);
  });
  
  console.log('\n🧩 Most Complex Files:');
  console.log('='.repeat(80));
  sortedByComplexity.slice(0, 10).forEach(file => {
    console.log(`Complexity ${file.complexity.toString().padStart(4)}: ${file.path}`);
  });
  
  // Statistics
  const totalLines = analysis.reduce((sum, f) => sum + f.lines, 0);
  const totalConsole = analysis.reduce((sum, f) => sum + f.console, 0);
  const avgLines = Math.round(totalLines / analysis.length);
  const largeFiles = analysis.filter(f => f.lines > 500).length;
  
  console.log('\n📈 Statistics:');
  console.log('='.repeat(80));
  console.log(`Total Files: ${analysis.length}`);
  console.log(`Total Lines: ${totalLines.toLocaleString()}`);
  console.log(`Average Lines per File: ${avgLines}`);
  console.log(`Files > 500 lines: ${largeFiles}`);
  console.log(`Total Console Statements: ${totalConsole}`);
  console.log(`Files Needing Refactoring: ${needsRefactoring.length}`);
  
  // Recommendations
  console.log('\n💡 Recommendations:');
  console.log('='.repeat(80));
  if (largeFiles > 0) {
    console.log(`⚠️  ${largeFiles} files exceed 500 lines - consider splitting`);
  }
  if (totalConsole > 1000) {
    console.log(`⚠️  ${totalConsole} console statements - use production logger`);
  }
  if (needsRefactoring.length > 0) {
    console.log(`⚠️  ${needsRefactoring.length} files need refactoring`);
  }
  
  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: analysis.length,
      totalLines,
      avgLines,
      largeFiles,
      totalConsole,
      needsRefactoring: needsRefactoring.length,
    },
    filesNeedingRefactoring: needsRefactoring.map(f => ({
      path: f.path,
      lines: f.lines,
      complexity: f.complexity,
      functions: f.functions,
    })),
    largestFiles: sortedByLines.slice(0, 20).map(f => ({
      path: f.path,
      lines: f.lines,
    })),
  };
  
  fs.writeFileSync(
    path.join(rootDir, 'refactoring-report.json'),
    JSON.stringify(report, null, 2)
  );
  
  console.log('\n✅ Detailed report saved to: refactoring-report.json\n');
}

// Run analysis
if (require.main === module) {
  analyzeCodebase();
}

module.exports = { analyzeCodebase, analyzeFile };
