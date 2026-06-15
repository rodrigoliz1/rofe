const fs = require('fs/promises');
const path = require('path');
console.log('Testing db file path...');
const filePath = path.join(__dirname, 'db.json');
console.log('filePath:', filePath);
fs.writeFile(filePath, '{}', 'utf8')
  .then(() => {
    console.log('Write complete!');
    return fs.readFile(filePath, 'utf8');
  })
  .then((content) => {
    console.log('Read content:', content);
    console.log('Success!');
  })
  .catch(err => {
    console.error('Error:', err);
  });
