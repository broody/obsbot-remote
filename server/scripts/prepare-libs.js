#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const arch = os.arch();
const platform = os.platform();

console.log(`Detected platform: ${platform}, architecture: ${arch}`);

if (platform !== 'linux') {
  console.error('Only Linux is currently supported');
  process.exit(1);
}

// Map Node.js architecture names to our folder names
const archMap = {
  'arm64': 'arm64',
  'x64': 'x64',
  'x86_64': 'x64'
};

const sourceArch = archMap[arch];

if (!sourceArch) {
  console.error(`Unsupported architecture: ${arch}`);
  process.exit(1);
}

const sdkDir = path.join(__dirname, '..', 'sdk');
const libDir = path.join(sdkDir, 'lib');
const sourceDir = path.join(libDir, sourceArch);
const targetDir = libDir;

// Check if source directory exists
if (!fs.existsSync(sourceDir)) {
  console.error(`Library directory not found for ${arch}: ${sourceDir}`);
  process.exit(1);
}

// Copy library files
const files = ['libdev.so', 'libdev.so.1', 'libdev.so.1.0.2'];

console.log(`Copying ${sourceArch} libraries to ${targetDir}...`);

files.forEach(file => {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`  Copied ${file}`);
  } else {
    console.warn(`  Warning: ${file} not found in source directory`);
  }
});

console.log('Library preparation complete!');
