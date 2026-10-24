-- Add hometown and bust to teacher profile
ALTER TABLE "TeacherProfile" ADD COLUMN IF NOT EXISTS "hometown" TEXT;
ALTER TABLE "TeacherProfile" ADD COLUMN IF NOT EXISTS "bust" TEXT;
