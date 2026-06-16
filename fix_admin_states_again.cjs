const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetState = `  const [orders, setOrders] = useState<Order[]>([]);
  const [bakeryBatches, setBakeryBatches] = useState<any[]>([]);
  const [cashAlerts, setCashAlerts] = useState<string[]>([]);
  const [stockAlerts, setStockAlerts] = useState<string[]>([]);
  const [bakeryExpirations, setBakeryExpirations] = useState<any[]>([]);`;

const repState = `  const [bakeryBatches, setBakeryBatches] = useState<any[]>([]);`;

content = content.replace(targetState, repState);

const loadTarget = `      if (alertsRes.ok) {
        const { cashAlerts: ca, stockAlerts: sa, bakeryExpirations: be } = await alertsRes.json();
        setCashAlerts(ca);
        setStockAlerts(sa);
        setBakeryExpirations(be);
      }`;
      
content = content.replace(loadTarget, `      // alerts are computed dynamically`);

fs.writeFileSync(file, content);
