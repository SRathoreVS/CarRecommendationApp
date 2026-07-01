"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScoredCar, UserAnswers } from "@/lib/scorer";
import {
  PRIMARY_USE_OPTIONS,
  PRIORITY_OPTIONS,
  formatPriceRange,
  mileageUnitFor,
  labelsFor,
} from "@/lib/options";

const MAX_COMPARE = 3;

type Status = "loading" | "ready" | "empty";

interface StoredPayload {
  results: ScoredCar[];
  answers: UserAnswers;
}

export default function ResultsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [results, setResults] = useState<ScoredCar[]>([]);
  const [answers, setAnswers] = useState<UserAnswers | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    const raw = sessionStorage.getItem("carResults");

    if (!raw) {
      setStatus("empty");
      router.replace("/");
      return;
    }

    try {
      const parsed: StoredPayload = JSON.parse(raw);
      if (!parsed.results || parsed.results.length === 0) {
        throw new Error("empty results");
      }
      setResults(parsed.results);
      setAnswers(parsed.answers);
      setStatus("ready");
    } catch {
      setStatus("empty");
      router.replace("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCompare(carId: string) {
    setCompareIds((current) => {
      if (current.includes(carId)) {
        return current.filter((id) => id !== carId);
      }
      if (current.length >= MAX_COMPARE) return current;
      return [...current, carId];
    });
  }

  function startOver() {
    sessionStorage.removeItem("carResults");
    router.push("/");
  }

  if (status === "loading") {
    return <LoadingSkeleton />;
  }

  if (status === "empty") {
    return (
      <main className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center px-4">
        <p className="text-gray-400 text-sm">Taking you back to start…</p>
      </main>
    );
  }

  const compareCars = results.filter((r) => compareIds.includes(r.car.id));

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 px-4 py-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Your Top Picks</h1>
          {answers && (
            <p className="mt-2 text-sm text-gray-400">
              {formatPriceRange(answers.budgetMin, answers.budgetMax)} ·{" "}
              {labelsFor(PRIMARY_USE_OPTIONS, answers.primaryUse)} ·
              Prioritizing {labelsFor(PRIORITY_OPTIONS, answers.topPriority)}
            </p>
          )}
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {results.map((result) => (
            <ResultCard
              key={result.car.id}
              result={result}
              checked={compareIds.includes(result.car.id)}
              disabled={
                !compareIds.includes(result.car.id) &&
                compareIds.length >= MAX_COMPARE
              }
              onToggle={() => toggleCompare(result.car.id)}
            />
          ))}
        </div>

        {compareCars.length >= 2 && <CompareTable cars={compareCars} />}

        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={startOver}
            className="px-5 py-2.5 rounded-lg text-sm font-medium border border-gray-700 text-gray-300 hover:border-gray-600 hover:text-gray-100 transition"
          >
            ← Start Over
          </button>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Result card
// ---------------------------------------------------------------------------

function countFeatures(featuresJson: string): number {
  try {
    const parsed = JSON.parse(featuresJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function ResultCard({
  result,
  checked,
  disabled,
  onToggle,
}: {
  result: ScoredCar;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { car, score, reason, isOverBudget } = result;
  const unit = mileageUnitFor(car.fuelType);
  const scorePercent = Math.round(score * 100);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4 hover:border-gray-700 transition">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold leading-snug">
            {car.make} {car.model}{" "}
            <span className="text-gray-500 font-normal">{car.year}</span>
          </h2>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge>{car.bodyType}</Badge>
            <Badge>{car.fuelType}</Badge>
            {isOverBudget && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Slightly over budget
              </span>
            )}
          </div>
        </div>
        <label className="flex flex-col items-center gap-1 text-[11px] text-gray-500 shrink-0">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={onToggle}
            className="w-4 h-4 accent-indigo-500 disabled:opacity-30"
          />
          Compare
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-gray-500 text-xs">Price</div>
          <div className="font-medium">
            {formatPriceRange(car.priceMin, car.priceMax)}
          </div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">Mileage</div>
          <div className="font-medium">
            {car.mileage} {unit}
          </div>
        </div>
        <div className="col-span-2">
          <div className="text-gray-500 text-xs mb-0.5">Safety</div>
          <StarRating rating={car.safetyRating} />
        </div>
      </div>

      <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-2.5 text-sm text-indigo-200">
        {reason}
      </div>

      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Match score</span>
          <span className="text-gray-300 font-medium">{scorePercent}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
            style={{ width: `${scorePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
      {children}
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  const percent = (Math.max(0, Math.min(5, rating)) / 5) * 100;

  return (
    <div className="flex items-center gap-2">
      <div className="relative inline-flex text-base leading-none">
        <div className="flex gap-0.5 text-gray-700">
          {"★★★★★".split("").map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>
        <div
          className="absolute inset-0 flex gap-0.5 text-amber-400 overflow-hidden"
          style={{ width: `${percent}%` }}
        >
          {"★★★★★".split("").map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>
      </div>
      <span className="text-xs text-gray-400">{rating.toFixed(1)}/5</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compare table
// ---------------------------------------------------------------------------

function CompareTable({ cars }: { cars: ScoredCar[] }) {
  const rows: {
    label: string;
    render: (r: ScoredCar) => React.ReactNode;
  }[] = [
    {
      label: "Price Range",
      render: (r) => formatPriceRange(r.car.priceMin, r.car.priceMax),
    },
    { label: "Body Type", render: (r) => r.car.bodyType },
    { label: "Fuel", render: (r) => r.car.fuelType },
    { label: "Seats", render: (r) => r.car.seatingCapacity },
    {
      label: "Mileage",
      render: (r) => `${r.car.mileage} ${mileageUnitFor(r.car.fuelType)}`,
    },
    {
      label: "Safety Rating",
      render: (r) => `${r.car.safetyRating.toFixed(1)}/5`,
    },
    {
      label: "Features",
      render: (r) => `${countFeatures(r.car.featuresJson)}`,
    },
  ];

  return (
    <div className="mt-10">
      <h2 className="text-xl font-bold tracking-tight mb-4">Compare</h2>
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900">
              <th className="text-left font-medium text-gray-500 px-4 py-3 w-36">
                &nbsp;
              </th>
              {cars.map((r) => (
                <th
                  key={r.car.id}
                  className="text-left font-semibold px-4 py-3 text-gray-100 whitespace-nowrap"
                >
                  {r.car.make} {r.car.model}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.label}
                className={idx % 2 === 0 ? "bg-gray-950" : "bg-gray-900/50"}
              >
                <td className="px-4 py-3 text-gray-500">{row.label}</td>
                {cars.map((r) => (
                  <td key={r.car.id} className="px-4 py-3 text-gray-200">
                    {row.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 px-4 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="h-8 w-56 bg-gray-800 rounded animate-pulse mb-3" />
        <div className="h-4 w-80 bg-gray-800/70 rounded animate-pulse mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-5 h-56 animate-pulse"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
