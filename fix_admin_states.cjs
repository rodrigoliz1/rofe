const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetState = `  const [, setOrders] = useState<Order[]>([]);
  const [bakeryBatches, setBakeryBatches] = useState<any[]>([]);`;

const repState = `  const [orders, setOrders] = useState<Order[]>([]);
  const [bakeryBatches, setBakeryBatches] = useState<any[]>([]);
  const [cashAlerts, setCashAlerts] = useState<string[]>([]);
  const [stockAlerts, setStockAlerts] = useState<string[]>([]);
  const [bakeryExpirations, setBakeryExpirations] = useState<any[]>([]);`;

if (content.includes(targetState)) {
  content = content.replace(targetState, repState);
} else {
  console.log("Could not find state target");
}

fs.writeFileSync(file, content);
