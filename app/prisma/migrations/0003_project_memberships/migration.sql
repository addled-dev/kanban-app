-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('ADMIN', 'READ_WRITE', 'VIEW');

-- AlterTable
ALTER TABLE "InviteToken"
    ALTER COLUMN "name" DROP NOT NULL,
    ADD COLUMN "projectId" TEXT,
    ADD COLUMN "projectRole" "ProjectRole";

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'READ_WRITE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "InviteToken_projectId_idx" ON "InviteToken"("projectId");
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");
CREATE INDEX "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- Foreign Keys
ALTER TABLE "InviteToken" ADD CONSTRAINT "InviteToken_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill project creators as project admins
INSERT INTO "ProjectMember" ("id", "projectId", "userId", "role", "createdAt", "updatedAt")
SELECT
    'pm_' || md5("id" || "ownerId"),
    "id",
    "ownerId",
    'ADMIN'::"ProjectRole",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Project";
