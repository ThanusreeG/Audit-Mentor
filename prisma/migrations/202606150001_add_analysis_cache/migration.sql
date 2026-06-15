-- CreateTable
CREATE TABLE "AnalysisCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "contractSource" TEXT NOT NULL,
    "analysisMode" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractHash" TEXT,
    "contractSource" TEXT NOT NULL,
    "contractType" TEXT,
    "riskScore" REAL,
    "riskReasons" TEXT,
    "detectedSignals" TEXT,
    "userSummary" TEXT,
    "analysisCacheId" TEXT,
    CONSTRAINT "AuditSession_analysisCacheId_fkey" FOREIGN KEY ("analysisCacheId") REFERENCES "AnalysisCache" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditSession" ("contractSource", "contractType", "createdAt", "detectedSignals", "id", "riskReasons", "riskScore", "userSummary") SELECT "contractSource", "contractType", "createdAt", "detectedSignals", "id", "riskReasons", "riskScore", "userSummary" FROM "AuditSession";
DROP TABLE "AuditSession";
ALTER TABLE "new_AuditSession" RENAME TO "AuditSession";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisCache_contractHash_key" ON "AnalysisCache"("contractHash");
