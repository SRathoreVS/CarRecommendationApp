import type { Car } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrimaryUse =
  | "CITY_COMMUTE"
  | "HIGHWAY_TOURING"
  | "FAMILY"
  | "OFFROAD"
  | "FIRST_CAR";

export type FuelTypePref =
  | "PETROL"
  | "DIESEL"
  | "CNG"
  | "ELECTRIC"
  | "HYBRID"
  | "no_preference";

export type TopPriority = "SAFETY" | "MILEAGE" | "FEATURES" | "PRICE";

export interface UserAnswers {
  budgetMin: number;
  budgetMax: number;
  primaryUse: PrimaryUse[]; // 1-2 selections
  familySize: number;
  fuelTypePref: FuelTypePref[]; // 1-2 selections
  topPriority: TopPriority[]; // 1-2 selections
}

export interface ScoredCar {
  car: Car;
  score: number;
  reason: string;
  isOverBudget: boolean;
}

interface Weights {
  budgetFit: number;
  primaryUseFit: number;
  familyFit: number;
  fuelTypeFit: number;
  safetyScore: number;
  mileageScore: number;
  featuresScore: number;
}

interface DimensionBreakdown extends Weights {}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BASE_WEIGHTS: Weights = {
  budgetFit: 0.25,
  primaryUseFit: 0.2,
  familyFit: 0.15,
  fuelTypeFit: 0.15,
  safetyScore: 0.1,
  mileageScore: 0.1,
  featuresScore: 0.05,
};

const PRIORITY_BOOST = 0.2;

const PRIORITY_TO_DIMENSION: Record<TopPriority, keyof Weights> = {
  SAFETY: "safetyScore",
  MILEAGE: "mileageScore",
  FEATURES: "featuresScore",
  PRICE: "budgetFit",
};

const OVER_BUDGET_BUFFER = 1.1; // 10% soft buffer above budgetMax

// Templates only exist for these 5 dimensions (per spec). primaryUseFit and
// featuresScore are still scored and weighted normally, they just aren't
// eligible to be picked as one of the "top 2" reason dimensions below.
const REASON_TEMPLATES: Partial<
  Record<keyof Weights, (ctx: ReasonContext) => string>
> = {
  budgetFit: (ctx) =>
    `Fits within your ₹${ctx.budgetMinL}–${ctx.budgetMaxL}L budget`,
  safetyScore: (ctx) => `Strong ${ctx.car.safetyRating}/5 safety rating`,
  mileageScore: (ctx) =>
    `Excellent ${ctx.car.mileage} ${ctx.mileageUnit} efficiency`,
  familyFit: (ctx) => `Comfortably seats your family of ${ctx.familySize}`,
  fuelTypeFit: (ctx) => `Matches your ${ctx.car.fuelType} preference`,
};

interface ReasonContext {
  car: Car;
  budgetMinL: string;
  budgetMaxL: string;
  familySize: number;
  mileageUnit: string;
}

// ---------------------------------------------------------------------------
// Weight redistribution
// ---------------------------------------------------------------------------

/**
 * Moves PRIORITY_BOOST worth of weight onto the dimension(s) tied to the
 * user's topPriority selections (1 or 2), taken proportionally from every
 * other dimension. If 2 priorities are selected, the boost is split evenly
 * between their two dimensions. The total weight always still sums to 1.
 */
function redistributeWeights(
  base: Weights,
  topPriority: TopPriority[],
): Weights {
  const boostDimensions = Array.from(
    new Set(topPriority.map((p) => PRIORITY_TO_DIMENSION[p])),
  );
  const boostPerDimension = PRIORITY_BOOST / boostDimensions.length;

  const otherDimensions = (Object.keys(base) as (keyof Weights)[]).filter(
    (dim) => !boostDimensions.includes(dim),
  );

  const otherWeightSum = otherDimensions.reduce(
    (sum, dim) => sum + base[dim],
    0,
  );

  const adjusted: Weights = { ...base };

  for (const dim of boostDimensions) {
    adjusted[dim] = base[dim] + boostPerDimension;
  }

  for (const dim of otherDimensions) {
    const proportion = base[dim] / otherWeightSum;
    adjusted[dim] = base[dim] - PRIORITY_BOOST * proportion;
  }

  return adjusted;
}

// ---------------------------------------------------------------------------
// Dataset-wide normalization maxes (computed once per request)
// ---------------------------------------------------------------------------

interface DatasetMaxes {
  maxSafetyRating: number;
  maxFeatureCountOverall: number;
  maxMileageByFuelType: Record<string, number>;
}

function countFeatures(car: Car): number {
  try {
    const parsed = JSON.parse(car.featuresJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

// Guards mileage-grouping and fuel-match logic against casing/whitespace
// drift in stored fuelType values (e.g. "Electric" vs "ELECTRIC") — without
// this, a mistyped row silently gets grouped with the wrong fuel type and
// its mileage score (and unit label) comes out wrong.
function normalizeFuelType(fuelType: string): string {
  return fuelType.trim().toUpperCase();
}

function computeDatasetMaxes(cars: Car[]): DatasetMaxes {
  let maxSafetyRating = 0;
  let maxFeatureCountOverall = 0;
  const maxMileageByFuelType: Record<string, number> = {};

  for (const car of cars) {
    if (car.safetyRating > maxSafetyRating) {
      maxSafetyRating = car.safetyRating;
    }

    const featureCount = countFeatures(car);
    if (featureCount > maxFeatureCountOverall) {
      maxFeatureCountOverall = featureCount;
    }

    const currentMax =
      maxMileageByFuelType[normalizeFuelType(car.fuelType)] ?? 0;
    if (car.mileage > currentMax) {
      maxMileageByFuelType[normalizeFuelType(car.fuelType)] = car.mileage;
    }
  }

  return { maxSafetyRating, maxFeatureCountOverall, maxMileageByFuelType };
}

// ---------------------------------------------------------------------------
// Per-dimension scoring
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface BudgetFitResult {
  budgetFit: number;
  isOverBudget: boolean;
  excluded: boolean;
}

function computeBudgetFit(
  car: Car,
  budgetMin: number,
  budgetMax: number,
): BudgetFitResult {
  const hardCeiling = budgetMax * OVER_BUDGET_BUFFER;

  if (car.priceMin > hardCeiling) {
    return { budgetFit: 0, isOverBudget: true, excluded: true };
  }

  const isOverBudget = car.priceMin > budgetMax;

  // Soft-buffer zone: priceMin is above budgetMax but within the 10% ceiling.
  // There's no actual price overlap with the user's range here, so the
  // overlap-ratio calc below would always floor to 0 — instead give it a
  // fixed near-miss score so it can still surface, just penalized relative
  // to anything actually in-budget.
  if (isOverBudget) {
    return { budgetFit: 0.3, isOverBudget, excluded: false };
  }

  // Fully inside the user's range
  if (car.priceMax <= budgetMax && car.priceMin >= budgetMin) {
    return { budgetFit: 1, isOverBudget, excluded: false };
  }

  // Overlap-ratio calculation between [priceMin, priceMax] and [budgetMin, budgetMax]
  const overlap =
    Math.min(car.priceMax, budgetMax) - Math.max(car.priceMin, budgetMin);
  const span = car.priceMax - car.priceMin;

  const budgetFit = span > 0 ? clamp(overlap / span, 0, 1) : 0;

  return { budgetFit, isOverBudget, excluded: false };
}

function computePrimaryUseFit(car: Car, primaryUse: PrimaryUse[]): number {
  const tags = car.suitedFor.split(",").map((t) => t.trim());
  const matches = primaryUse.some((use) => tags.includes(use));
  return matches ? 1 : 0.4;
}

function computeFamilyFit(car: Car, familySize: number): number {
  if (car.seatingCapacity >= familySize) return 1;
  const deficit = familySize - car.seatingCapacity;
  return Math.max(0, 1 - deficit * 0.3);
}

function computeFuelTypeFit(car: Car, fuelTypePref: FuelTypePref[]): number {
  if (fuelTypePref.length === 0 || fuelTypePref.includes("no_preference")) {
    return 1;
  }
  const normalizedCarFuel = normalizeFuelType(car.fuelType);
  const matches = fuelTypePref.some(
    (pref) => normalizeFuelType(pref) === normalizedCarFuel,
  );
  return matches ? 1 : 0.3;
}

function computeSafetyScore(car: Car, maxSafetyRating: number): number {
  if (maxSafetyRating <= 0) return 0;
  return clamp(car.safetyRating / maxSafetyRating, 0, 1);
}

function computeMileageScore(
  car: Car,
  maxMileageByFuelType: Record<string, number>,
): number {
  const maxForFuelType =
    maxMileageByFuelType[normalizeFuelType(car.fuelType)] ?? 0;
  if (maxForFuelType <= 0) return 0;
  return clamp(car.mileage / maxForFuelType, 0, 1);
}

function computeFeaturesScore(
  car: Car,
  maxFeatureCountOverall: number,
): number {
  if (maxFeatureCountOverall <= 0) return 0;
  return clamp(countFeatures(car) / maxFeatureCountOverall, 0, 1);
}

// ---------------------------------------------------------------------------
// Reason generation
// ---------------------------------------------------------------------------

function mileageUnitFor(fuelType: string): string {
  const normalized = fuelType.trim().toUpperCase();
  if (normalized === "ELECTRIC") return "km/charge";
  if (normalized === "CNG") return "km/kg";
  return "kmpl";
}

function generateReason(
  car: Car,
  breakdown: DimensionBreakdown,
  weights: Weights,
  answers: UserAnswers,
): string {
  // Contribution = weight * normalized dimension value. Only dimensions with
  // a template defined are eligible to be picked.
  const templatedDimensions = Object.keys(
    REASON_TEMPLATES,
  ) as (keyof Weights)[];

  const ranked = templatedDimensions
    .map((dim) => ({
      dim,
      contribution: weights[dim] * breakdown[dim],
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const top2 = ranked.slice(0, 2);

  const ctx: ReasonContext = {
    car,
    budgetMinL: (answers.budgetMin / 100000).toFixed(1),
    budgetMaxL: (answers.budgetMax / 100000).toFixed(1),
    familySize: answers.familySize,
    mileageUnit: mileageUnitFor(car.fuelType),
  };

  const sentences = top2.map((entry) => REASON_TEMPLATES[entry.dim]!(ctx));

  if (sentences.length === 0) return "A solid match for your criteria.";
  if (sentences.length === 1) return `${sentences[0]}.`;

  return `${sentences[0]}, and ${sentences[1].charAt(0).toLowerCase()}${sentences[1].slice(1)}.`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function scoreCar(
  car: Car,
  answers: UserAnswers,
  weights: Weights,
  maxes: DatasetMaxes,
): { score: number; reason: string; isOverBudget: boolean; excluded: boolean } {
  const { budgetFit, isOverBudget, excluded } = computeBudgetFit(
    car,
    answers.budgetMin,
    answers.budgetMax,
  );

  if (excluded) {
    return { score: 0, reason: "", isOverBudget, excluded: true };
  }

  const breakdown: DimensionBreakdown = {
    budgetFit,
    primaryUseFit: computePrimaryUseFit(car, answers.primaryUse),
    familyFit: computeFamilyFit(car, answers.familySize),
    fuelTypeFit: computeFuelTypeFit(car, answers.fuelTypePref),
    safetyScore: computeSafetyScore(car, maxes.maxSafetyRating),
    mileageScore: computeMileageScore(car, maxes.maxMileageByFuelType),
    featuresScore: computeFeaturesScore(car, maxes.maxFeatureCountOverall),
  };

  const rawScore =
    breakdown.budgetFit * weights.budgetFit +
    breakdown.primaryUseFit * weights.primaryUseFit +
    breakdown.familyFit * weights.familyFit +
    breakdown.fuelTypeFit * weights.fuelTypeFit +
    breakdown.safetyScore * weights.safetyScore +
    breakdown.mileageScore * weights.mileageScore +
    breakdown.featuresScore * weights.featuresScore;

  const reason = generateReason(car, breakdown, weights, answers);

  return {
    score: Math.round(rawScore * 1000) / 1000, // round to 3 decimal places
    reason,
    isOverBudget,
    excluded: false,
  };
}

/**
 * Scores every car against the user's answers, excludes anything priced
 * more than 10% over budgetMax, and returns the top 5 by score descending.
 */
export function rankCars(cars: Car[], answers: UserAnswers): ScoredCar[] {
  const weights = redistributeWeights(BASE_WEIGHTS, answers.topPriority);
  const maxes = computeDatasetMaxes(cars);

  const scored: ScoredCar[] = [];

  for (const car of cars) {
    const result = scoreCar(car, answers, weights, maxes);
    if (result.excluded) continue;

    scored.push({
      car,
      score: result.score,
      reason: result.reason,
      isOverBudget: Boolean(result.isOverBudget),
    });
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 5);
}
