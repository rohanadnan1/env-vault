ALTER TABLE "User"
ADD COLUMN "username" TEXT,
ADD COLUMN "usernameSetAt" TIMESTAMP(3),
ADD COLUMN "usernameLockedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
