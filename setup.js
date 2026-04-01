const fs = require('fs');
const path = require('path');

console.log('🔧 Setting up project directories...');

const directories = [
  'uploads',
  'uploads/certificates',
  'logs',
  'server',
  'server/middleware',
  'server/services',
  'server/routes',
  'server/database',
  'server/jobs'
];

directories.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  } else {
    console.log(`✓ Directory exists: ${dir}`);
  }
});

console.log('✅ Setup complete!');
