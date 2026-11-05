const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Usage: node scripts/hash-password.cjs "a-password-with-8-or-more-characters"');
  process.exit(1);
}

bcrypt.hash(password, 12).then((hash) => process.stdout.write(`${hash}\n`));
