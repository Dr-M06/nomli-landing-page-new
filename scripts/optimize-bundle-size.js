#!/usr/bin/env node

/**
 * Bundle Size Optimization Script
 * Analyzes and suggests optimizations for reducing app size
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LARGE_DEPENDENCIES = [
  { name: 'lodash', size: '~70KB', suggestion: 'Use individual imports (lodash/debounce)' },
  { name: 'express', size: '~100KB', suggestion: 'Remove (not needed in RN)' },
  { name: 'cors', size: '~10KB', suggestion: 'Remove (not needed in RN)' },
];

const UNUSED_DEPENDENCIES = [
  'express',
  'cors',
  'fix',
];

function checkDependencies() {
  console.log('\n📦 Analyzing Dependencies...');
  console.log('='.repeat(80));
  
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  console.log('\n🔴 Large Dependencies:');
  LARGE_DEPENDENCIES.forEach(dep => {
    if (deps[dep.name]) {
      console.log(`  ⚠️  ${dep.name}: ${dep.size}`);
      console.log(`     💡 ${dep.suggestion}`);
    }
  });
  
  console.log('\n🟡 Potentially Unused Dependencies:');
  UNUSED_DEPENDENCIES.forEach(dep => {
    if (deps[dep]) {
      const used = execSync(`grep -r "from.*['\"]${dep}" . --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null | grep -v node_modules | wc -l`, { encoding: 'utf8' }).trim();
      if (used === '0') {
        console.log(`  ✗ ${dep} - NOT USED (can be removed)`);
      } else {
        console.log(`  ✓ ${dep} - USED (${used} references)`);
      }
    }
  });
}

function checkLazyLoading() {
  console.log('\n🚀 Checking Lazy Loading Opportunities...');
  console.log('='.repeat(80));
  
  const heavyComponents = [
    'VideoPicker',
    'GiftModal',
    'ViewerListModal',
    'GuestManagementModal',
  ];
  
  console.log('\nComponents that should be lazy loaded:');
  heavyComponents.forEach(component => {
    const files = execSync(`grep -r "import.*${component}" . --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v node_modules | wc -l`, { encoding: 'utf8' }).trim();
    if (files !== '0') {
      const eagerImports = execSync(`grep -r "import.*${component}.*from" . --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v "React.lazy" | grep -v node_modules | wc -l`, { encoding: 'utf8' }).trim();
      if (eagerImports !== '0') {
        console.log(`  ⚠️  ${component}: ${eagerImports} eager imports (should use React.lazy)`);
      }
    }
  });
}

function checkAssets() {
  console.log('\n🖼️  Analyzing Assets...');
  console.log('='.repeat(80));
  
  const assetsDir = path.join(process.cwd(), 'assets');
  if (!fs.existsSync(assetsDir)) {
    console.log('  No assets directory found');
    return;
  }
  
  // Check animation files
  const animationsDir = path.join(assetsDir, 'animations');
  if (fs.existsSync(animationsDir)) {
    const animations = fs.readdirSync(animationsDir).filter(f => f.endsWith('.json'));
    console.log(`\n  📊 Lottie Animations: ${animations.length} files`);
    animations.forEach(anim => {
      const filePath = path.join(animationsDir, anim);
      const size = fs.statSync(filePath).size;
      const sizeKB = (size / 1024).toFixed(2);
      console.log(`     ${anim}: ${sizeKB}KB`);
      if (size > 100 * 1024) {
        console.log(`        ⚠️  Large file - consider optimizing`);
      }
    });
  }
  
  // Check image files
  const imagesDir = path.join(assetsDir, 'images');
  if (fs.existsSync(imagesDir)) {
    const images = [];
    function findImages(dir) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          findImages(filePath);
        } else if (/\.(png|jpg|jpeg|webp)$/i.test(file)) {
          images.push({ path: filePath, size: stat.size });
        }
      });
    }
    findImages(imagesDir);
    
    console.log(`\n  📊 Images: ${images.length} files`);
    const totalSize = images.reduce((sum, img) => sum + img.size, 0);
    console.log(`     Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
    
    const largeImages = images.filter(img => img.size > 500 * 1024);
    if (largeImages.length > 0) {
      console.log(`\n  ⚠️  Large images (>500KB):`);
      largeImages.slice(0, 10).forEach(img => {
        const sizeKB = (img.size / 1024).toFixed(2);
        console.log(`     ${path.relative(assetsDir, img.path)}: ${sizeKB}KB`);
      });
    }
  }
}

function checkCodeSplitting() {
  console.log('\n📦 Checking Code Splitting Opportunities...');
  console.log('='.repeat(80));
  
  const largeFiles = [];
  function findLargeFiles(dir, baseDir = '') {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory() && !file.includes('node_modules')) {
        findLargeFiles(filePath, path.join(baseDir, file));
      } else if (/\.(tsx?|jsx?)$/.test(file)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').length;
        if (lines > 500) {
          largeFiles.push({
            path: path.join(baseDir, file),
            lines,
            size: stat.size,
          });
        }
      }
    });
  }
  
  ['components', 'app', 'utils'].forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      findLargeFiles(dirPath, dir);
    }
  });
  
  if (largeFiles.length > 0) {
    console.log('\n  ⚠️  Large files (>500 lines) that could be split:');
    largeFiles
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 10)
      .forEach(file => {
        console.log(`     ${file.path}: ${file.lines} lines`);
      });
  } else {
    console.log('\n  ✓ No large files found');
  }
}

function generateRecommendations() {
  console.log('\n💡 Recommendations:');
  console.log('='.repeat(80));
  
  console.log('\n1. Remove unused dependencies:');
  console.log('   npm uninstall express cors fix');
  
  console.log('\n2. Replace lodash with individual imports:');
  console.log('   import debounce from "lodash/debounce"');
  
  console.log('\n3. Lazy load heavy components:');
  console.log('   const Component = React.lazy(() => import("./Component"))');
  
  console.log('\n4. Optimize images:');
  console.log('   npx imagemin assets/images/**/*.{png,jpg} --out-dir=assets/images/optimized/');
  
  console.log('\n5. Split large components:');
  console.log('   Break files >500 lines into smaller modules');
  
  console.log('\n6. Configure better tree shaking:');
  console.log('   Update metro.config.js with inlineRequires: true');
}

// Main execution
console.log('📊 Bundle Size Optimization Analysis');
console.log('='.repeat(80));

checkDependencies();
checkLazyLoading();
checkAssets();
checkCodeSplitting();
generateRecommendations();

console.log('\n✅ Analysis complete!');
console.log('\n📖 See APP_SIZE_REDUCTION_GUIDE.md for detailed optimization steps.\n');
