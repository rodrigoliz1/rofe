const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/const \[showQuickAddModal, setShowQuickAddModal\] = useState\(false\);/, '');
content = content.replace(/const \[showManualAdjustModal, setShowManualAdjustModal\] = useState\(false\);/, '');

content = content.replace(/setCashLeftInRegister\(''\);/, 'setClosureDenominations({});');

fs.writeFileSync(file, content);
