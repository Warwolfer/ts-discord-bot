const fs = require('fs');

// Read actions.js
const actionsContent = fs.readFileSync('actions.js', 'utf8');

// Build lookup to category map
const categoryMap = {};
const actionRegex = /\{\s*id:\s*\d+,\s*lookup:\s*["']([^"']+)["'][^}]+category:\s*["']([^"']+)["']/gs;
let match;
while ((match = actionRegex.exec(actionsContent)) !== null) {
  categoryMap[match[1]] = match[2];
}

// Handler name to lookup conversion (some use hyphens in actions.js)
const nameToLookup = {
  'Attack': 'attack',
  'Rush': 'rush',
  'Stable': 'stable-attack',
  'Burst': 'burst-attack',
  'Sneak': 'sneak-attack',
  'Critical': 'critical-attack',
  'Sharp': 'sharp-attack',
  'Reckless': 'reckless-attack',
  'AreaEffect': 'area-effect',
  'Duelist': 'duelist',
  'Sharpshooter': 'sharpshooter',
  'Range': 'range',
  'Lethal': 'lethal',
  'Swift': 'swift',
  'Protect': 'protect',
  'UltraProtect': 'ultra-protect',
  'Counter': 'counter',
  'UltraCounter': 'ultra-counter',
  'Torment': 'torment',
  'Cover': 'cover',
  'Taunt': 'taunt',
  'Sturdy': 'sturdy',
  'Heal': 'heal',
  'PowerHeal': 'power-heal',
  'Revive': 'revive',
  'Cleanse': 'cleanse',
  'Buff': 'buff',
  'PowerBuff': 'power-buff',
  'Imbue': 'imbue',
  'Versatile': 'versatile',
  'Haste': 'haste',
  'Inspire': 'inspire',
  'Guardian': 'guardian',
  'Aggress': 'aggress',
  'Savior': 'savior',
  'Acrimony': 'acrimony',
  'Smite': 'smite',
  'Overdrive': 'overdrive',
  'Rage': 'rage',
  'Gift': 'gift',
  'FollowUp': 'follow-up',
  'Locomote': 'locomote',
  'Blessed': 'blessed'
};

// Handler files
const handlerFiles = {
  'basic': 'handlers/basic.js',
  'utility': 'handlers/basic.js',  // utility maps to basic.js
  'offense': 'handlers/offense.js',
  'defense': 'handlers/defense.js',
  'support': 'handlers/support.js',
  'alter': 'handlers/alter.js'
};

const results = {
  correct: [],
  misplaced: [],
  notFound: []
};

// Process each unique file
const processedFiles = new Set();
for (const [fileCategory, filePath] of Object.entries(handlerFiles)) {
  // Skip if we already processed this file
  if (processedFiles.has(filePath)) continue;
  processedFiles.add(filePath);

  const content = fs.readFileSync(filePath, 'utf8');
  const handlerMatches = content.matchAll(/async function handle(\w+)\(/g);

  for (const match of handlerMatches) {
    const handlerName = match[1];
    const lookup = nameToLookup[handlerName] || handlerName.toLowerCase();
    const actualCategory = categoryMap[lookup];

    if (!actualCategory) {
      results.notFound.push(`? ${handlerName} (lookup: ${lookup}) - not found in actions.js`);
    } else {
      // Determine expected file for this handler
      const expectedFile = handlerFiles[actualCategory];

      if (expectedFile === filePath) {
        results.correct.push(`✓ ${handlerName} -> ${actualCategory} (in ${filePath})`);
      } else {
        results.misplaced.push(`✗ ${handlerName} in ${filePath} but category is '${actualCategory}' (should be in ${expectedFile})`);
      }
    }
  }
}

console.log('=== VERIFICATION RESULTS ===\n');

if (results.misplaced.length > 0) {
  console.log('MISPLACED HANDLERS:');
  results.misplaced.forEach(r => console.log(r));
  console.log('');
}

if (results.notFound.length > 0) {
  console.log('NOT FOUND IN actions.js:');
  results.notFound.forEach(r => console.log(r));
  console.log('');
}

console.log('CORRECTLY PLACED (' + results.correct.length + '):');
results.correct.forEach(r => console.log(r));

console.log('\n=== SUMMARY ===');
console.log('Correct: ' + results.correct.length);
console.log('Misplaced: ' + results.misplaced.length);
console.log('Not found: ' + results.notFound.length);

if (results.misplaced.length === 0 && results.notFound.length === 0) {
  console.log('\n✓✓✓ ALL HANDLERS CORRECTLY CATEGORIZED ✓✓✓');
}
