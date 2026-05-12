const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');

// Create dist directory
fs.mkdirSync(distDir, { recursive: true });

// Copy manifest.json to dist/
fs.copyFileSync(
  path.resolve(__dirname, '..', 'manifest.json'),
  path.join(distDir, 'manifest.json')
);

console.log('Extension assembled in dist/');
