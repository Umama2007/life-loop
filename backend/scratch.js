const fs = require('fs');
const path = require('path');

const routeDir = path.join(__dirname, 'src', 'routes');

const files = fs.readdirSync(routeDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(routeDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Find all router.METHOD(..., (req, res) => {
  // and replace (req, res) with async (req, res)
  content = content.replace(/(router\.(?:get|post|put|patch|delete)\s*\([^;]+?)(?<!async\s*)\(\s*req\s*,\s*res\s*\)\s*=>\s*\{/g, '$1async (req, res) => {');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Processed ${file}`);
});
