const fs = require('fs');

function patchFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Find where extraShot is appended and add custom variants text
  const target = `    if (item.customization.extraShot) {
      parts.push('Extra Shot');
    }`;
  
  const rep = `    if (item.customization.extraShot) {
      parts.push('Extra Shot');
    }

    if (item.selectedCustomVariants) {
      Object.entries(item.selectedCustomVariants).forEach(([group, opt]) => {
        parts.push(\`\${group}: \${opt}\`);
      });
    }`;

  if (content.includes(target) && !content.includes('item.selectedCustomVariants')) {
    content = content.replace(target, rep);
    fs.writeFileSync(file, content);
  }
}

patchFile('src/components/Cart.tsx');
patchFile('src/components/BaristaView.tsx');
