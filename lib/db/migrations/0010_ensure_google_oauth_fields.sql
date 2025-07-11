-- Migration: Ensure Google OAuth fields exist in User table
-- This checks if the columns exist and adds them if they don't

DO $$
BEGIN
    -- Check if googleAccessToken column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'User' AND column_name = 'googleAccessToken'
    ) THEN
        ALTER TABLE "User" ADD COLUMN "googleAccessToken" text;
    END IF;

    -- Check if googleRefreshToken column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'User' AND column_name = 'googleRefreshToken'
    ) THEN
        ALTER TABLE "User" ADD COLUMN "googleRefreshToken" text;
    END IF;

    -- Check if googleTokenExpiry column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'User' AND column_name = 'googleTokenExpiry'
    ) THEN
        ALTER TABLE "User" ADD COLUMN "googleTokenExpiry" timestamp;
    END IF;
END
$$;
