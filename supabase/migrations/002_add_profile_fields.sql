-- ============================================================================
-- Migration: Add profile fields to user_settings
-- ============================================================================
-- Adds name, sex, and age columns to support the onboarding profile step.
-- All columns are nullable so existing rows remain valid.
-- ============================================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS sex TEXT CHECK (sex IN ('male', 'female')),
  ADD COLUMN IF NOT EXISTS age INTEGER CHECK (age >= 1 AND age <= 120);
