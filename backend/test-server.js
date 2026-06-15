console.log('1. Importing express...');
const express = require('express');
console.log('2. Importing cors...');
const cors = require('cors');
console.log('3. Importing dotenv...');
const dotenv = require('dotenv');
console.log('4. Importing db...');
const { db } = require('./dist/db');

console.log('5. Configuring app...');
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

console.log('6. Initializing db...');
db.initialize().then(() => {
  console.log('7. Db initialized successfully!');
  app.listen(3000, () => {
    console.log('8. Server listening on port 3000!');
    process.exit(0); // Exit successfully to show it works!
  });
}).catch(err => {
  console.error('Db init error:', err);
  process.exit(1);
});
