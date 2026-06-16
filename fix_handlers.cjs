const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/setShowManualAdjustModal\(false\);/g, 'setShowRawItemDetailModal(false);');
content = content.replace(/setShowQuickAddModal\(false\);/g, 'setShowRawItemDetailModal(false);');

const unusedStates = `  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [showManualAdjustModal, setShowManualAdjustModal] = useState(false);`;

content = content.replace(unusedStates, '');

fs.writeFileSync(file, content);
