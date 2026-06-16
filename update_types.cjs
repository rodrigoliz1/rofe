const fs = require('fs');

const frontendTypes = 'src/types.ts';
let fContent = fs.readFileSync(frontendTypes, 'utf8');

const variantDef = `export interface CustomVariantOption {
  name: string;
  priceModifier: number;
}

export interface CustomVariantGroup {
  title: string;
  options: CustomVariantOption[];
}

export interface Product {`;

fContent = fContent.replace(/export interface Product \{/, variantDef);
fContent = fContent.replace(/recipe\?: Record<string, number>; \/\/ Recipe logic/g, `recipe?: Record<string, number>; // Recipe logic
  custom_variants?: CustomVariantGroup[];`);
fs.writeFileSync(frontendTypes, fContent);

const backendDb = 'backend/src/db.ts';
let bContent = fs.readFileSync(backendDb, 'utf8');

const dbVariantDef = `export interface CustomVariantOption {
  name: string;
  priceModifier: number;
}

export interface CustomVariantGroup {
  title: string;
  options: CustomVariantOption[];
}

export interface DbProduct {`;

bContent = bContent.replace(/export interface DbProduct \{/, dbVariantDef);
bContent = bContent.replace(/recipe\?: Record<string, number>; \/\/ e\.g\., \{ "coffee_beans": 25, "milk_whole": 280 \}/g, `recipe?: Record<string, number>;
  custom_variants?: CustomVariantGroup[];`);

fs.writeFileSync(backendDb, bContent);
