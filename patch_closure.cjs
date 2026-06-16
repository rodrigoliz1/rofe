const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Change state
content = content.replace(
  `const [cashLeftInRegister, setCashLeftInRegister] = useState('');`,
  `const [closureDenominations, setClosureDenominations] = useState<Record<string, number>>({});`
);

// 2. Pre-load closureDenominations in loadAllData
const loadTarget = `      if (regRes.ok) setAdjustedRegister(await regRes.json());`;
const loadRep = `      if (regRes.ok) {
        const regData = await regRes.json();
        setAdjustedRegister(regData);
        setClosureDenominations(regData);
      }`;
content = content.replace(loadTarget, loadRep);

// 3. handleAdjustClosureDenom function
const handleAdjustDenomTarget = `  const handleAdjustDenom = (denom: string, val: number) => {`;
const handleAdjustClosureDenomFn = `  const handleAdjustClosureDenom = (denom: string, val: number) => {
    setClosureDenominations(prev => ({
      ...prev,
      [denom]: Math.max(0, (prev[denom] || 0) + val)
    }));
  };

  const handleAdjustDenom = (denom: string, val: number) => {`;
content = content.replace(handleAdjustDenomTarget, handleAdjustClosureDenomFn);

// 4. Update handleExecuteClosure
const execTarget = `  const handleExecuteClosure = async () => {
    if (!closureStats) return;
    const finalCash = parseFloat(cashLeftInRegister);
    if (isNaN(finalCash)) {
      alert('Por favor ingresa cuánto efectivo dejarás en caja (Fondo de Caja).');
      return;
    }
    try {
      const res = await fetch(getApiUrl('/api/admin/closures'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...closureStats,
          cash_end: finalCash
        })
      });`;
const execRep = `  const handleExecuteClosure = async () => {
    if (!closureStats) return;
    
    // Calculate total cash from denominations
    let finalCash = 0;
    const DENOM_VALUES: Record<string, number> = {
      bill_1000: 1000, bill_500: 500, bill_200: 200, bill_100: 100, bill_50: 50, bill_20: 20,
      coin_20: 20, coin_10: 10, coin_5: 5, coin_2: 2, coin_1: 1, coin_0_50: 0.5, coin_0_20: 0.2
    };
    Object.entries(closureDenominations).forEach(([d, q]) => {
      finalCash += q * (DENOM_VALUES[d] || 0);
    });

    try {
      const res = await fetch(getApiUrl('/api/admin/closures'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...closureStats,
          cash_end: finalCash,
          denominations_left: closureDenominations
        })
      });`;
content = content.replace(execTarget, execRep);

fs.writeFileSync(file, content);
