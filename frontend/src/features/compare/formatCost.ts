export function formatCostUsd(value: number | null | undefined): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  if (value > 0 && value < 0.0001) return '< $0,0001';
  return `$${value.toLocaleString('ru-RU', {
    useGrouping: false,
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}`;
}
