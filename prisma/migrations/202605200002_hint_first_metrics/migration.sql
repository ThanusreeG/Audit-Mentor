ALTER TABLE "Vulnerability" ADD COLUMN "identifiedHow" TEXT;
ALTER TABLE "Vulnerability" ADD COLUMN "solvedAtHintLevel" INTEGER;
ALTER TABLE "Vulnerability" ADD COLUMN "wrongGuessCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Vulnerability" ADD COLUMN "revealedAfterWrong" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vulnerability" ADD COLUMN "revealedAfterBlank" BOOLEAN NOT NULL DEFAULT false;
