-- Migration: Add Google OAuth fields to User table
-- This adds fields to store Google OAuth tokens for calendar integration

ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "googleAccessToken" text,
ADD COLUMN IF NOT EXISTS "googleRefreshToken" text,
ADD COLUMN IF NOT EXISTS "googleTokenExpiry" timestamp;
