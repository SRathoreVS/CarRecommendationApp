-- CreateTable
CREATE TABLE "Car" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "priceMin" INTEGER NOT NULL,
    "priceMax" INTEGER NOT NULL,
    "bodyType" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "seatingCapacity" INTEGER NOT NULL,
    "mileage" REAL NOT NULL,
    "safetyRating" REAL NOT NULL,
    "suitedFor" TEXT NOT NULL,
    "featuresJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Car_priceMin_priceMax_idx" ON "Car"("priceMin", "priceMax");

-- CreateIndex
CREATE INDEX "Car_bodyType_idx" ON "Car"("bodyType");

-- CreateIndex
CREATE INDEX "Car_fuelType_idx" ON "Car"("fuelType");
