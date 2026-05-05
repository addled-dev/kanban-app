-- CreateEnum
CREATE TYPE "WorkItemType" AS ENUM ('EPIC', 'FEATURE', 'STORY', 'TASK');

-- AlterTable
ALTER TABLE "Task"
  ADD COLUMN "type" "WorkItemType" NOT NULL DEFAULT 'TASK',
  ADD COLUMN "parentId" TEXT;

-- Indexes
CREATE INDEX "Task_projectId_parentId_idx" ON "Task"("projectId", "parentId");
CREATE INDEX "Task_projectId_type_idx" ON "Task"("projectId", "type");

-- Foreign Keys
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
