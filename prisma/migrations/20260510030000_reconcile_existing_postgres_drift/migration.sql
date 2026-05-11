-- Normalize historical foreign keys so migration replay matches the live DB.
ALTER TABLE "RecoveryCode" DROP CONSTRAINT IF EXISTS "RecoveryCode_userId_fkey";
ALTER TABLE "ShareComment" DROP CONSTRAINT IF EXISTS "ShareComment_authorId_fkey";
ALTER TABLE "ShareDownloadLog" DROP CONSTRAINT IF EXISTS "ShareDownloadLog_userId_fkey";
ALTER TABLE "ShareEditRequest" DROP CONSTRAINT IF EXISTS "ShareEditRequest_requesterId_fkey";

CREATE INDEX IF NOT EXISTS "ShareInvitation_inviteToken_idx" ON "ShareInvitation"("inviteToken");

ALTER TABLE "RecoveryCode"
  ADD CONSTRAINT "RecoveryCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShareDownloadLog"
  ADD CONSTRAINT "ShareDownloadLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShareEditRequest"
  ADD CONSTRAINT "ShareEditRequest_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShareComment"
  ADD CONSTRAINT "ShareComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
