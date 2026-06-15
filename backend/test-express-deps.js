const deps = [
  'accepts', 'array-flatten', 'body-parser', 'content-disposition', 'content-type',
  'cookie', 'cookie-signature', 'debug', 'depd', 'encodeurl', 'escape-html',
  'etag', 'finalhandler', 'fresh', 'http-errors', 'merge-descriptors', 'methods',
  'on-finished', 'parseurl', 'path-to-regexp', 'proxy-addr', 'qs', 'range-parser',
  'safe-buffer', 'send', 'serve-static', 'setprototypeof', 'statuses', 'type-is',
  'utils-merge', 'vary'
];

console.log('Testing express dependencies...');

for (const dep of deps) {
  try {
    console.log(`Loading ${dep}...`);
    require(dep);
    console.log(`Loaded ${dep} successfully!`);
  } catch (e) {
    console.log(`Failed loading ${dep}: ${e.message}`);
  }
}

console.log('All express dependencies tested!');
