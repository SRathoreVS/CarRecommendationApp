// Shared, framework-agnostic constants used by both app/page.tsx (questionnaire)
// and app/results/page.tsx. Deliberately has no dependency on @prisma/client or
// any server-only module so it's safe to import from client components.

export interface CardOption<T extends string> {
  value: T;
  label: string;
  icon: string;
}

export const PRIMARY_USE_OPTIONS: CardOption<
  "CITY_COMMUTE" | "HIGHWAY_TOURING" | "FAMILY" | "OFFROAD" | "FIRST_CAR"
>[] = [
  { value: "CITY_COMMUTE", label: "City Commute", icon: "🏙️" },
  { value: "HIGHWAY_TOURING", label: "Highway Touring", icon: "🛣️" },
  { value: "FAMILY", label: "Family Use", icon: "👨‍👩‍👧" },
  { value: "OFFROAD", label: "Off-road", icon: "🏔️" },
  { value: "FIRST_CAR", label: "First Car", icon: "🎓" },
];

export const FUEL_TYPE_OPTIONS: CardOption<
  "PETROL" | "DIESEL" | "CNG" | "ELECTRIC" | "HYBRID" | "no_preference"
>[] = [
  { value: "PETROL", label: "Petrol", icon: "⛽" },
  { value: "DIESEL", label: "Diesel", icon: "🛢️" },
  { value: "CNG", label: "CNG", icon: "🌿" },
  { value: "ELECTRIC", label: "Electric", icon: "⚡" },
  { value: "HYBRID", label: "Hybrid", icon: "🔋" },
  { value: "no_preference", label: "No Preference", icon: "🤷" },
];

export const PRIORITY_OPTIONS: CardOption<
  "SAFETY" | "MILEAGE" | "FEATURES" | "PRICE"
>[] = [
  { value: "SAFETY", label: "Safety", icon: "🛡️" },
  { value: "MILEAGE", label: "Mileage", icon: "📊" },
  { value: "FEATURES", label: "Features", icon: "✨" },
  { value: "PRICE", label: "Best Price", icon: "💰" },
];

export const BUDGET_PRESETS: { label: string; min: number; max: number }[] = [
  { label: "Under ₹8L", min: 0, max: 800000 },
  { label: "₹8L–₹15L", min: 800000, max: 1500000 },
  { label: "₹15L–₹25L", min: 1500000, max: 2500000 },
  { label: "₹25L+", min: 2500000, max: 5000000 },
];

export function formatLakh(rupees: number): string {
  return `₹${(rupees / 100000).toFixed(1)}L`;
}

export function formatPriceRange(priceMin: number, priceMax: number): string {
  return `${formatLakh(priceMin)} – ${formatLakh(priceMax)}`;
}

export function mileageUnitFor(fuelType: string): string {
  const normalized = fuelType.trim().toUpperCase();
  if (normalized === "ELECTRIC") return "km/charge";
  if (normalized === "CNG") return "km/kg";
  return "kmpl";
}

export const MAX_MULTI_SELECT = 2;

export function labelFor<T extends string>(
  options: CardOption<T>[],
  value: T,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function labelsFor<T extends string>(
  options: CardOption<T>[],
  values: T[],
): string {
  // Defensive: guards against stale sessionStorage payloads saved by an
  // older single-select version of the app, where this field was a plain
  // string instead of an array.
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return list.map((v) => labelFor(options, v)).join(", ");
}
