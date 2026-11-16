import type { ModelPricing } from './models.js';
import type { GenerateUsage } from './aiProxy.js';

export function estimateCostUsd(
  pricing: ModelPricing | undefined,
  usage: GenerateUsage | undefined,
): number | null {
  if (
    !pricing ||
    !usage ||
    Array.isArray(pricing) ||
    Array.isArray(usage) ||
    !Number.isFinite(pricing.input) ||
    pricing.input < 0 ||
    !Number.isFinite(pricing.output) ||
    pricing.output < 0 ||
    !Number.isSafeInteger(usage.inputTokens) ||
    usage.inputTokens < 0 ||
    !Number.isSafeInteger(usage.outputTokens) ||
    usage.outputTokens < 0
  )
    return null;
  const cost =
    usage.inputTokens * (pricing.input / 1_000_000) +
    usage.outputTokens * (pricing.output / 1_000_000);
  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}
