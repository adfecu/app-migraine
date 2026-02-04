-- ============================================================================
-- Migraine App Database Schema
-- ============================================================================
-- This migration creates all necessary tables for storing user data including
-- check-ins, crisis episodes, user settings, CL history, and threshold data.
-- ============================================================================

-- ============================================================================
-- Table: check_ins
-- Stores all check-in and crisis episode entries
-- ============================================================================
CREATE TABLE IF NOT EXISTS check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('checkin', 'crisis')),
  answers JSONB NOT NULL,
  questions TEXT[] NOT NULL,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for check_ins
CREATE INDEX IF NOT EXISTS idx_check_ins_user_id ON check_ins(user_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_date ON check_ins(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_check_ins_type ON check_ins(user_id, type);

-- ============================================================================
-- Table: user_settings
-- Stores user-specific settings (single row per user)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  headache_threshold NUMERIC NOT NULL DEFAULT 75,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Table: cl_history
-- Stores daily Cumulative Load values (one row per user per date)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cl_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  cl_value NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Index for cl_history
CREATE INDEX IF NOT EXISTS idx_cl_history_user_date ON cl_history(user_id, date DESC);

-- ============================================================================
-- Table: threshold_data
-- Stores CL values from non-migraine headache days for threshold training
-- ============================================================================
CREATE TABLE IF NOT EXISTS threshold_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cl_value NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for threshold_data
CREATE INDEX IF NOT EXISTS idx_threshold_data_user_id ON threshold_data(user_id);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- Enable RLS and create policies so users can only access their own data
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cl_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE threshold_data ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Policies for check_ins table
-- ============================================================================
CREATE POLICY "Users can view own check_ins" 
  ON check_ins FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own check_ins" 
  ON check_ins FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own check_ins" 
  ON check_ins FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own check_ins" 
  ON check_ins FOR DELETE 
  USING (auth.uid() = user_id);

-- ============================================================================
-- Policies for user_settings table
-- ============================================================================
CREATE POLICY "Users can view own settings" 
  ON user_settings FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" 
  ON user_settings FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" 
  ON user_settings FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings" 
  ON user_settings FOR DELETE 
  USING (auth.uid() = user_id);

-- ============================================================================
-- Policies for cl_history table
-- ============================================================================
CREATE POLICY "Users can view own cl_history" 
  ON cl_history FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cl_history" 
  ON cl_history FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cl_history" 
  ON cl_history FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own cl_history" 
  ON cl_history FOR DELETE 
  USING (auth.uid() = user_id);

-- ============================================================================
-- Policies for threshold_data table
-- ============================================================================
CREATE POLICY "Users can view own threshold_data" 
  ON threshold_data FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own threshold_data" 
  ON threshold_data FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own threshold_data" 
  ON threshold_data FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own threshold_data" 
  ON threshold_data FOR DELETE 
  USING (auth.uid() = user_id);

-- ============================================================================
-- Function to automatically update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================
CREATE TRIGGER update_check_ins_updated_at
  BEFORE UPDATE ON check_ins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cl_history_updated_at
  BEFORE UPDATE ON cl_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
