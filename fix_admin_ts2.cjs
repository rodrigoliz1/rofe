const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(`      let startDate = '';
      let endDate = '';
      
      if (datePreset === 'today') {`, `      if (datePreset === 'today') {`);

content = content.replace(`        if (customStartDate) startDate = new Date(\`\${customStartDate}T00:00:00\`).toISOString();
        if (customEndDate) endDate = new Date(\`\${customEndDate}T23:59:59\`).toISOString();
      }`, `      }`);

fs.writeFileSync(file, content);
