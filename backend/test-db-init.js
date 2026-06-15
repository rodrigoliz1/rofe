const { db } = require('./dist/db');
console.log('Loaded db. Calling initialize...');
db.initialize()
  .then(() => {
    console.log('Initialize complete!');
    return db.getInventory();
  })
  .then(inv => {
    console.log('Inventory size:', inv.length);
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
