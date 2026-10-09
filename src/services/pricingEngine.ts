import { Service, BundlePricingRule, PricingDisplayMode, PricingEvaluation } from '../types';

/**
 * Calculates pricing for a selection of services based on business configuration,
 * bundle pricing rules, and display modes.
 */
export function calculatePricing(
  services: Service[],
  bundleRules: BundlePricingRule[],
  displayMode: PricingDisplayMode
): PricingEvaluation {
  if (displayMode === 'hidden') {
    return {
      items: services.map(s => ({
        name: s.name,
        originalPrice: 0,
        finalPrice: 0
      })),
      bundlesApplied: [],
      totalPrice: 0,
      displayMode: 'hidden'
    };
  }

  if (displayMode === 'consult') {
    return {
      items: services.map(s => ({
        name: s.name,
        originalPrice: 0,
        finalPrice: 0,
        note: 'A consultar'
      })),
      bundlesApplied: [],
      totalPrice: 0,
      displayMode: 'consult',
      variableNote: 'El valor final se define en la cita tras diagnóstico profesional.'
    };
  }

  // Sorted bundle rules by priority / highest saving potential
  const sortedRules = [...bundleRules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const remainingServiceIds = new Set(services.map(s => s.id));
  const appliedBundles: { name: string; savedAmount: number; bundlePrice: number }[] = [];
  
  let totalCalculated = 0;
  const itemsBreakdown: PricingEvaluation['items'] = [];

  // 1. Try applying bundles greedily
  for (const rule of sortedRules) {
    const hasAll = rule.serviceIds.every(sid => remainingServiceIds.has(sid));
    if (hasAll) {
      // Calculate standard sum of these services
      const bundledServices = services.filter(s => rule.serviceIds.includes(s.id));
      const regularSum = bundledServices.reduce((sum, s) => sum + (s.price || 0), 0);
      const savings = Math.max(0, regularSum - rule.bundlePrice);

      appliedBundles.push({
        name: rule.name,
        savedAmount: savings,
        bundlePrice: rule.bundlePrice
      });

      totalCalculated += rule.bundlePrice;

      // Add each item with note
      bundledServices.forEach(bs => {
        itemsBreakdown.push({
          name: bs.name,
          originalPrice: bs.price || 0,
          finalPrice: bs.price || 0,
          note: `Incluido en combo: ${rule.name}`
        });
      });

      // Remove from remaining
      rule.serviceIds.forEach(sid => remainingServiceIds.delete(sid));
    }
  }

  // 2. Add remaining unbundled services
  for (const sid of remainingServiceIds) {
    const s = services.find(item => item.id === sid);
    if (s) {
      const price = s.price || 0;
      totalCalculated += price;
      itemsBreakdown.push({
        name: s.name,
        originalPrice: price,
        finalPrice: price,
        note: s.priceType === 'starting_at' ? 'Desde' : undefined
      });
    }
  }

  // Check if any service has variable pricing ('starting_at')
  const hasVariablePricing = services.some(s => s.priceType === 'starting_at');
  let variableNote: string | undefined;

  if (hasVariablePricing) {
    variableNote = 'El importe final puede variar según el diagnóstico o las características del servicio.';
  }

  return {
    items: itemsBreakdown,
    bundlesApplied: appliedBundles,
    totalPrice: totalCalculated,
    displayMode,
    variableNote
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(amount);
}
