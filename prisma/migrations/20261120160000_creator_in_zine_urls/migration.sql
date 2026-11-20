-- DIG-102: a zine's slug is unique per creator, not across the site.
-- DropIndex
DROP INDEX "Zine_slug_key";

-- DIG-102: every user gets a short public ID, the creator part of /z/<publicId>/<slug>. The default is
-- evaluated for each existing row, so current users are backfilled, and every way of creating a user
-- (sign-up, Google, seed, scripts) gets one without setting it.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "publicId" TEXT NOT NULL DEFAULT substr(md5(((random())::text || (clock_timestamp())::text)), 1, 8);

-- CreateIndex
CREATE UNIQUE INDEX "User_publicId_key" ON "User"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Zine_ownerId_slug_key" ON "Zine"("ownerId", "slug");
