import type { CustomizationOptions } from '../types';

export function pickupSummary(customization: CustomizationOptions | undefined, selections: Record<string, string> = {}, customizable = true, preparation?: string[]): string {
  if (preparation) return preparation.join(" · ") || "Receta de la casa";
  const parts = Object.entries(selections).map(([group, option]) => `${group}: ${option}`);
  if (customizable && customization) {
    if (customization.size === 'grande') parts.push('Grande');
    const milk = { none: '', whole: 'Leche entera', light: 'Leche light', avena: 'Leche de avena', almendra: 'Leche de almendra' }[customization.milk];
    if (milk) parts.push(milk);
    parts.push(customization.temp === 'iced' ? 'Con hielo' : 'Caliente');
    parts.push({ none: 'Sin endulzar', standard: 'Dulzor normal', extra: 'Dulzor extra' }[customization.sweetness]);
    if (customization.extraShot) parts.push('Shot extra');
  }
  return parts.filter(Boolean).join(' · ');
}
