import type { DbProduct, DbRawInventory } from '../db';

export const DEFAULT_PRODUCTS: DbProduct[] = [
  { id: 'espresso', name: 'Espresso', description: 'Extracción doble, intensa y dulce.', price: 38, category: 'coffee', icon: 'espresso', customizable: true, image: '/espresso.webp', recipe: { coffee_beans: 18 } },
  { id: 'americano', name: 'Americano', description: 'Espresso doble alargado con agua caliente.', price: 45, category: 'coffee', icon: 'americano', customizable: true, image: '/americano.webp', recipe: { coffee_beans: 18 } },
  { id: 'latte', name: 'Latte', description: 'Espresso con leche texturizada y espuma fina.', price: 55, category: 'coffee', icon: 'latte', customizable: true, image: '/iced-latte.webp', recipe: { coffee_beans: 18, milk_whole: 250 } },
  { id: 'matcha-latte', name: 'Matcha latte', description: 'Matcha ceremonial con leche texturizada.', price: 65, category: 'coffee', icon: 'latte', customizable: true, image: '/matcha-latte.jpg', recipe: { matcha_powder: 4, milk_whole: 250 } },
  { id: 'cold-brew', name: 'Cold brew', description: 'Café extraído en frío, limpio y refrescante.', price: 58, category: 'cold', icon: 'cold_brew', customizable: true, image: '/cold-brew.webp', recipe: { cold_brew_concentrate: 180 } },
  { id: 'iced-latte', name: 'Iced latte', description: 'Espresso, leche y hielo.', price: 60, category: 'cold', icon: 'latte', customizable: true, image: '/iced-latte.webp', recipe: { coffee_beans: 18, milk_whole: 220, ice: 120 } },
  { id: 'croissant-mantequilla', name: 'Croissant de mantequilla', description: 'Hojaldre laminado, crujiente y ligero.', price: 45, category: 'bakery', icon: 'croissant', customizable: false, image: '/pan-chocolate.jpg', recipe: { croissant_finished: 1 } },
  { id: 'galleta-chocolate', name: 'Galleta de chocolate', description: 'Galleta suave con chispas de chocolate.', price: 35, category: 'bakery', icon: 'pain_choc', customizable: false, image: '/galleta-chispas.jpeg', recipe: { cookie_finished: 1 } },
];

export const DEFAULT_RAW_INVENTORY: DbRawInventory[] = [
  { id: 'coffee_beans', name: 'Café en grano', unit: 'g', stock: 5_000, cost: 2_500, minStock: 1_000 },
  { id: 'milk_whole', name: 'Leche entera', unit: 'ml', stock: 12_000, cost: 384, minStock: 3_000 },
  { id: 'milk_light', name: 'Leche deslactosada', unit: 'ml', stock: 6_000, cost: 216, minStock: 1_500 },
  { id: 'milk_avena', name: 'Leche de avena', unit: 'ml', stock: 4_000, cost: 320, minStock: 1_000 },
  { id: 'milk_almendra', name: 'Leche de almendra', unit: 'ml', stock: 4_000, cost: 360, minStock: 1_000 },
  { id: 'matcha_powder', name: 'Matcha', unit: 'g', stock: 500, cost: 1_200, minStock: 100 },
  { id: 'cold_brew_concentrate', name: 'Concentrado cold brew', unit: 'ml', stock: 5_000, cost: 700, minStock: 1_000 },
  { id: 'ice', name: 'Hielo', unit: 'g', stock: 20_000, cost: 200, minStock: 5_000 },
  { id: 'croissant_finished', name: 'Croissant terminado', unit: 'piece', stock: 30, cost: 540, minStock: 8 },
  { id: 'cookie_finished', name: 'Galleta terminada', unit: 'piece', stock: 40, cost: 320, minStock: 10 },
];
