const fs = require('fs');
const path = require('path');

const content = fs.readFileSync('./app.js', 'utf-8');

// extract ALL base64 strings (long ones only)
const matches = [...content.matchAll(/"([A-Za-z0-9+/=]{500,})"/g)];

console.log(`Found ${matches.length} long base64 strings`);

const OUTPUT_DIR = './public/assets/daab/sa';

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

matches.forEach((m, i) => {
  const base64 = m[1];
  const buffer = Buffer.from(base64, 'base64');

  let ext = 'jpg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) ext = 'png';

  const filename = `row${String(i + 1).padStart(2, '0')}.${ext}`;
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), buffer);

  console.log(`Saved ${filename}`);
});