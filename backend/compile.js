const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const files = ['db.ts', 'index.ts'];
const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  esModuleInterop: true,
};

files.forEach(file => {
  const srcPath = path.join(srcDir, file);
  const distPath = path.join(distDir, file.replace('.ts', '.js'));
  console.log(`Transpiling ${srcPath} -> ${distPath}`);
  
  const content = fs.readFileSync(srcPath, 'utf8');
  const result = ts.transpileModule(content, { compilerOptions });
  
  fs.writeFileSync(distPath, result.outputText, 'utf8');
});

console.log('Compilation complete!');
