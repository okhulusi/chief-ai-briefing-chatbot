-- Migration: Force add Google OAuth fields to User table
-- This migration explicitly adds the Google OAuth fields to the User table

ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "googleAccessToken" text,
ADD COLUMN IF NOT EXISTS "googleRefreshToken" text,
ADD COLUMN IF NOT EXISTS "googleTokenExpiry" timestamp;
