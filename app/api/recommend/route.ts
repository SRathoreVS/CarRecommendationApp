import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  rankCars,
  type FuelTypePref,
  type PrimaryUse,
  type TopPriority,
  type UserAnswers,
} from "@/lib/scorer";

const VALID_PRIMARY_USE: PrimaryUse[] = [
  "CITY_COMMUTE",
  "HIGHWAY_TOURING",
  "FAMILY",
  "OFFROAD",
  "FIRST_CAR",
];

const VALID_FUEL_TYPE_PREF: FuelTypePref[] = [
  "PETROL",
  "DIESEL",
  "CNG",
  "ELECTRIC",
  "HYBRID",
  "no_preference",
];

const VALID_TOP_PRIORITY: TopPriority[] = [
  "SAFETY",
  "MILEAGE",
  "FEATURES",
  "PRICE",
];

const MAX_SELECTIONS = 2;

/**
 * Validates a field that must be an array of 1-2 values, each drawn from
 * validValues. Returns an error string, or null if valid.
 */
function validateSelectionArray(
  value: any,
  validValues: string[],
  fieldName: string,
): string | null {
  if (!Array.isArray(value)) {
    return `${fieldName} must be an array`;
  }
  if (value.length === 0) {
    return `${fieldName} must have at least 1 selection`;
  }
  if (value.length > MAX_SELECTIONS) {
    return `${fieldName} can have at most ${MAX_SELECTIONS} selections`;
  }
  for (const v of value) {
    if (!validValues.includes(v)) {
      return `${fieldName} contains an invalid value: ${v}`;
    }
  }
  return null;
}

function validate(body: any): string | null {
  if (body.budgetMin === undefined || body.budgetMin === null) {
    return "budgetMin is required";
  }
  if (body.budgetMax === undefined || body.budgetMax === null) {
    return "budgetMax is required";
  }
  if (
    typeof body.budgetMin !== "number" ||
    typeof body.budgetMax !== "number"
  ) {
    return "budgetMin and budgetMax must be numbers";
  }
  if (body.budgetMax < body.budgetMin) {
    return "budgetMax must be greater than or equal to budgetMin";
  }

  const primaryUseError = validateSelectionArray(
    body.primaryUse,
    VALID_PRIMARY_USE,
    "primaryUse",
  );
  if (primaryUseError) return primaryUseError;

  if (
    typeof body.familySize !== "number" ||
    body.familySize < 1 ||
    body.familySize > 8
  ) {
    return "familySize must be a number between 1 and 8";
  }

  const fuelTypeError = validateSelectionArray(
    body.fuelTypePref,
    VALID_FUEL_TYPE_PREF,
    "fuelTypePref",
  );
  if (fuelTypeError) return fuelTypeError;

  if (
    body.fuelTypePref.includes("no_preference") &&
    body.fuelTypePref.length > 1
  ) {
    return "fuelTypePref cannot combine no_preference with other fuel types";
  }

  const topPriorityError = validateSelectionArray(
    body.topPriority,
    VALID_TOP_PRIORITY,
    "topPriority",
  );
  if (topPriorityError) return topPriorityError;

  return null;
}

export async function POST(request: NextRequest) {
  let body: any;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const validationError = validate(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const answers: UserAnswers = {
    budgetMin: body.budgetMin,
    budgetMax: body.budgetMax,
    primaryUse: body.primaryUse,
    familySize: body.familySize,
    fuelTypePref: body.fuelTypePref,
    topPriority: body.topPriority,
  };

  // Intentionally fetch all — scoring happens in-memory;
  // 30-car dataset makes this a non-issue vs added SQL complexity
  const allCars = await prisma.car.findMany();
  const results = rankCars(allCars, answers);

  return NextResponse.json({ results });
}
