"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PRIMARY_USE_OPTIONS,
  FUEL_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  BUDGET_PRESETS,
  MAX_MULTI_SELECT,
  formatLakh,
  type CardOption,
} from "@/lib/options";

type PrimaryUse = (typeof PRIMARY_USE_OPTIONS)[number]["value"];
type FuelTypePref = (typeof FUEL_TYPE_OPTIONS)[number]["value"];
type TopPriority = (typeof PRIORITY_OPTIONS)[number]["value"];

interface Answers {
  budgetMin: number;
  budgetMax: number;
  primaryUse: PrimaryUse[];
  familySize: number;
  fuelTypePref: FuelTypePref[];
  topPriority: TopPriority[];
}

const TOTAL_STEPS = 5;
const STEP_LABELS = ["Budget", "Use", "Family", "Fuel", "Priority"];

const initialAnswers: Answers = {
  budgetMin: 500000,
  budgetMax: 1500000,
  primaryUse: [],
  familySize: 2,
  fuelTypePref: [],
  topPriority: [],
};

/** Toggles a value in a selection array, capped at MAX_MULTI_SELECT. */
function toggleSelection<T>(current: T[], value: T, max: number): T[] {
  if (current.includes(value)) {
    return current.filter((v) => v !== value);
  }
  if (current.length >= max) {
    return current;
  }
  return [...current, value];
}

/**
 * Fuel type has a special case: "no_preference" is mutually exclusive with
 * every specific fuel type. Picking it clears other selections; picking a
 * specific fuel type while "no_preference" is active replaces it.
 */
function toggleFuelSelection(
  current: FuelTypePref[],
  value: FuelTypePref,
): FuelTypePref[] {
  if (value === "no_preference") {
    return current.includes("no_preference") ? [] : ["no_preference"];
  }
  const withoutNoPreference = current.filter((v) => v !== "no_preference");
  return toggleSelection(withoutNoPreference, value, MAX_MULTI_SELECT);
}

export default function QuestionnairePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isLastStep = step === TOTAL_STEPS - 1;

  const canAdvance = (() => {
    switch (step) {
      case 0:
        return answers.budgetMin < answers.budgetMax;
      case 1:
        return answers.primaryUse.length >= 1 && answers.primaryUse.length <= 2;
      case 2:
        return answers.familySize >= 1 && answers.familySize <= 8;
      case 3:
        return (
          answers.fuelTypePref.length >= 1 && answers.fuelTypePref.length <= 2
        );
      case 4:
        return (
          answers.topPriority.length >= 1 && answers.topPriority.length <= 2
        );
      default:
        return false;
    }
  })();

  async function handleNext() {
    if (!canAdvance) return;

    if (!isLastStep) {
      setStep((s) => s + 1);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        budgetMin: answers.budgetMin,
        budgetMax: answers.budgetMax,
        primaryUse: answers.primaryUse,
        familySize: answers.familySize,
        fuelTypePref: answers.fuelTypePref,
        topPriority: answers.topPriority,
      };

      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? "Something went wrong fetching recommendations.",
        );
      }

      const data = await res.json();

      sessionStorage.setItem(
        "carResults",
        JSON.stringify({ results: data.results, answers: payload }),
      );

      router.push("/results");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
      setSubmitting(false);
    }
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-xl">
        <RouteProgress step={step} />

        <div className="mt-10 bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/30">
          {step === 0 && (
            <BudgetStep
              budgetMin={answers.budgetMin}
              budgetMax={answers.budgetMax}
              onChange={(min, max) =>
                setAnswers((a) => ({ ...a, budgetMin: min, budgetMax: max }))
              }
            />
          )}

          {step === 1 && (
            <CardStep
              heading="How will you mainly use the car?"
              options={PRIMARY_USE_OPTIONS}
              selected={answers.primaryUse}
              onToggle={(v) =>
                setAnswers((a) => ({
                  ...a,
                  primaryUse: toggleSelection(
                    a.primaryUse,
                    v,
                    MAX_MULTI_SELECT,
                  ),
                }))
              }
            />
          )}

          {step === 2 && (
            <FamilySizeStep
              familySize={answers.familySize}
              onChange={(n) => setAnswers((a) => ({ ...a, familySize: n }))}
            />
          )}

          {step === 3 && (
            <CardStep
              heading="Any fuel type preference?"
              options={FUEL_TYPE_OPTIONS}
              selected={answers.fuelTypePref}
              onToggle={(v) =>
                setAnswers((a) => ({
                  ...a,
                  fuelTypePref: toggleFuelSelection(a.fuelTypePref, v),
                }))
              }
            />
          )}

          {step === 4 && (
            <CardStep
              heading="What matters most to you?"
              options={PRIORITY_OPTIONS}
              selected={answers.topPriority}
              onToggle={(v) =>
                setAnswers((a) => ({
                  ...a,
                  topPriority: toggleSelection(
                    a.topPriority,
                    v,
                    MAX_MULTI_SELECT,
                  ),
                }))
              }
            />
          )}

          {submitError && (
            <p className="mt-4 text-sm text-red-400">{submitError}</p>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 0 || submitting}
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 disabled:opacity-0 disabled:pointer-events-none transition"
            >
              ← Back
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={!canAdvance || submitting}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed disabled:text-gray-500 text-white transition shadow-lg shadow-indigo-950/50"
            >
              {submitting
                ? "Finding your matches…"
                : isLastStep
                  ? "Find My Car →"
                  : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Progress indicator — a dashed "route" with a car marker, since dots alone
// don't say much about a 5-question journey toward a car recommendation.
// ---------------------------------------------------------------------------

function RouteProgress({ step }: { step: number }) {
  const percent = (step / (TOTAL_STEPS - 1)) * 100;

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        <span>
          Step {step + 1} of {TOTAL_STEPS}
        </span>
        <span className="text-gray-400">{STEP_LABELS[step]}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-gray-800 overflow-visible">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
        <div
          className="absolute -top-2.5 -translate-x-1/2 transition-all duration-500 ease-out text-base"
          style={{ left: `${percent}%` }}
        >
          🚗
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Budget
// ---------------------------------------------------------------------------

function BudgetStep({
  budgetMin,
  budgetMax,
  onChange,
}: {
  budgetMin: number;
  budgetMax: number;
  onChange: (min: number, max: number) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">What's your budget?</h1>
      <p className="mt-1 text-sm text-gray-400">
        Ex-showroom price range you're comfortable with.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {BUDGET_PRESETS.map((preset) => {
          const active = preset.min === budgetMin && preset.max === budgetMax;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(preset.min, preset.max)}
              className={`px-3.5 py-2 rounded-full text-sm font-medium border transition ${
                active
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-gray-800/60 border-gray-700 text-gray-300 hover:border-gray-600"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="mt-8 space-y-5">
        <div>
          <label className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span>Minimum</span>
            <span className="text-gray-200 font-medium">
              {formatLakh(budgetMin)}
            </span>
          </label>
          <input
            type="range"
            min={0}
            max={5000000}
            step={50000}
            value={budgetMin}
            onChange={(e) => {
              const next = Number(e.target.value);
              onChange(Math.min(next, budgetMax - 50000), budgetMax);
            }}
            className="w-full accent-indigo-500"
          />
        </div>

        <div>
          <label className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span>Maximum</span>
            <span className="text-gray-200 font-medium">
              {formatLakh(budgetMax)}
            </span>
          </label>
          <input
            type="range"
            min={0}
            max={5000000}
            step={50000}
            value={budgetMax}
            onChange={(e) => {
              const next = Number(e.target.value);
              onChange(budgetMin, Math.max(next, budgetMin + 50000));
            }}
            className="w-full accent-violet-500"
          />
        </div>
      </div>

      <div className="mt-6 text-center py-3 rounded-xl bg-gray-800/50 border border-gray-800">
        <span className="text-lg font-semibold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
          {formatLakh(budgetMin)} – {formatLakh(budgetMax)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Family size
// ---------------------------------------------------------------------------

function FamilySizeStep({
  familySize,
  onChange,
}: {
  familySize: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">
        How many people need to fit comfortably?
      </h1>
      <p className="mt-1 text-sm text-gray-400">
        Include yourself, plus everyone who rides regularly.
      </p>

      <div className="mt-10 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, familySize - 1))}
          disabled={familySize <= 1}
          className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 text-xl text-gray-200 hover:border-indigo-500 disabled:opacity-30 disabled:hover:border-gray-700 transition"
        >
          −
        </button>

        <div className="w-28 text-center">
          <div className="text-4xl font-bold tabular-nums">{familySize}</div>
          <div className="text-xs text-gray-400 mt-1">
            {familySize === 1 ? "person" : "people"}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onChange(Math.min(8, familySize + 1))}
          disabled={familySize >= 8}
          className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 text-xl text-gray-200 hover:border-indigo-500 disabled:opacity-30 disabled:hover:border-gray-700 transition"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic card-select step (used for primary use, fuel type, priority)
// ---------------------------------------------------------------------------

function CardStep<T extends string>({
  heading,
  options,
  selected,
  onToggle,
}: {
  heading: string;
  options: CardOption<T>[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
      <p className="mt-1 text-sm text-gray-400">
        Choose 1 or {MAX_MULTI_SELECT}.
      </p>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {options.map((opt) => {
          const active = selected.includes(opt.value);
          const atCap = !active && selected.length >= MAX_MULTI_SELECT;

          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              disabled={atCap}
              className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border px-3 py-5 text-center transition ${
                active
                  ? "bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500"
                  : atCap
                    ? "bg-gray-800/20 border-gray-800 opacity-40 cursor-not-allowed"
                    : "bg-gray-800/40 border-gray-700 hover:border-gray-600"
              }`}
            >
              {active && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center leading-none">
                  ✓
                </span>
              )}
              <span className="text-2xl">{opt.icon}</span>
              <span
                className={`text-sm font-medium ${
                  active ? "text-indigo-200" : "text-gray-300"
                }`}
              >
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
