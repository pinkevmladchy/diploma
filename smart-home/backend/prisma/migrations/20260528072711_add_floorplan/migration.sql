-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "floorplan_x" DOUBLE PRECISION,
ADD COLUMN     "floorplan_y" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "floorplan_url" TEXT;
