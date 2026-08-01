-- CreateTable
CREATE TABLE "app_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedChessSource" TEXT,
    "linkedChessUsername" TEXT,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_saved_games" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pgn" TEXT NOT NULL,
    "finalFen" TEXT NOT NULL,
    "playerColor" TEXT NOT NULL,
    "opponentName" TEXT,
    "opponentRating" INTEGER,
    "opponentSource" TEXT,
    "result" TEXT,
    "numMoves" INTEGER NOT NULL,
    "timeControl" TEXT,
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_saved_games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "app_users_username_key" ON "app_users"("username");

-- CreateIndex
CREATE INDEX "app_saved_games_userId_createdAt_idx" ON "app_saved_games"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "app_saved_games" ADD CONSTRAINT "app_saved_games_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
