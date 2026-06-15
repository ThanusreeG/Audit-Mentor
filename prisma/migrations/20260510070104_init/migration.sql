-- CreateTable
CREATE TABLE "AuditSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractSource" TEXT NOT NULL,
    "contractType" TEXT,
    "riskScore" REAL,
    "riskReasons" TEXT,
    "detectedSignals" TEXT,
    "userSummary" TEXT
);

-- CreateTable
CREATE TABLE "Vulnerability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "codeSnippet" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "attackScenario" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "fix" TEXT NOT NULL,
    "learningNote" TEXT NOT NULL,
    "hint1" TEXT NOT NULL,
    "hint2" TEXT NOT NULL,
    "hint3" TEXT NOT NULL,
    "matchKeywords" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "identifiedByUser" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Vulnerability_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuditSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuessAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "vulnerabilityId" TEXT,
    "userInput" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuessAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuditSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
