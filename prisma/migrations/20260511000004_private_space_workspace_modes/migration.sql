CREATE TYPE "SpaceWorkspaceResourceMode" AS ENUM ('DRAFT', 'FORK', 'SYNC');

ALTER TABLE "UserFile"
ADD COLUMN "workspaceMode" "SpaceWorkspaceResourceMode" NOT NULL DEFAULT 'DRAFT';

ALTER TABLE "UserSecret"
ADD COLUMN "workspaceMode" "SpaceWorkspaceResourceMode" NOT NULL DEFAULT 'DRAFT';

UPDATE "UserFile"
SET "workspaceMode" = CASE
  WHEN "kingFileId" IS NULL THEN 'DRAFT'::"SpaceWorkspaceResourceMode"
  ELSE 'SYNC'::"SpaceWorkspaceResourceMode"
END;

UPDATE "UserSecret"
SET "workspaceMode" = CASE
  WHEN "kingSecretId" IS NULL THEN 'DRAFT'::"SpaceWorkspaceResourceMode"
  ELSE 'SYNC'::"SpaceWorkspaceResourceMode"
END;
