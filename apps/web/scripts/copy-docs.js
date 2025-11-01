/**
 * copy-docs.js
 * 
 * This script copies all markdown files from the docs directory to the public/docs directory.
 * It's designed to be run during the build process to ensure documentation is included in production builds.
 * 
 * Usage: node scripts/copy-docs.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define paths
// Docs are at the root level of the monorepo, not in apps/web
const docsDir = path.join(__dirname, '../../../docs');
const publicDocsDir = path.join(__dirname, '../public/docs');

// Ensure the public/docs directory exists
if (!fs.existsSync(publicDocsDir)) {
  fs.mkdirSync(publicDocsDir, { recursive: true });
  console.log(`Created directory: ${publicDocsDir}`);
}

// Check if docs directory exists
if (!fs.existsSync(docsDir)) {
  console.log('No docs directory found - skipping documentation copy.');
  process.exit(0);
}

// Copy all markdown files
console.log('Copying markdown files to public/docs...');
fs.readdir(docsDir, (err, files) => {
  if (err) {
    console.error('Error reading docs directory:', err);
    console.log('Continuing build without docs...');
    process.exit(0); // Exit successfully instead of failing the build
  }

  const markdownFiles = files.filter(file => file.endsWith('.md'));
  
  if (markdownFiles.length === 0) {
    console.log('No markdown files found in docs directory.');
    process.exit(0);
  }

  let copiedCount = 0;
  markdownFiles.forEach(file => {
    const sourcePath = path.join(docsDir, file);
    const destPath = path.join(publicDocsDir, file);
    
    fs.copyFile(sourcePath, destPath, (err) => {
      if (err) {
        console.error(`Error copying ${sourcePath} to ${destPath}:`, err);
        return;
      }
      
      copiedCount++;
      console.log(`Copied: ${file} → public/docs/`);
      
      // Check if all files have been processed
      if (copiedCount === markdownFiles.length) {
        console.log(`Successfully copied ${copiedCount} markdown files.`);
      }
    });
  });
});
