const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `  const handleSaveQuickAdd = async () => {`;
const replacement = `  const handleSaveManualAdjust = async () => {
    if (!quickAddSelection) return;
    const s = parseFloat(quickAddQuantity);
    const c = parseFloat(quickAddCost);
    if (isNaN(s) || isNaN(c)) { alert('Valores inválidos.'); return; }
    try {
      const res = await fetch(getApiUrl('/api/admin/raw-inventory'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: quickAddSelection.id, stock: s, cost: c }),
      });
      if (res.ok) {
        setShowManualAdjustModal(false);
        loadAllData();
      } else alert('Error al guardar ajuste.');
    } catch (e) { alert('Error de red.'); }
  };

  const handleSaveQuickAdd = async () => {`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
