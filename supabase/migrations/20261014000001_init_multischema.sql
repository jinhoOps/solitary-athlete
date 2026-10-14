-- Supabase multi-schema initialization
-- 1. Create schemas for personal projects
CREATE SCHEMA IF NOT EXISTS individualsavingflow;
CREATE SCHEMA IF NOT EXISTS player_one;
CREATE SCHEMA IF NOT EXISTS solitary_athlete;

-- 2. Grant USAGE permissions on schemas to standard Supabase roles
GRANT USAGE ON SCHEMA individualsavingflow TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA player_one TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA solitary_athlete TO anon, authenticated, service_role;

-- 3. Move existing player-one tables from public to player_one schema (preserving data & RLS)
ALTER TABLE IF EXISTS public.profiles SET SCHEMA player_one;
ALTER TABLE IF EXISTS public.items SET SCHEMA player_one;

-- 4. Create compatibility views in public schema for backward compatibility
CREATE OR REPLACE VIEW public.profiles AS SELECT * FROM player_one.profiles;
CREATE OR REPLACE VIEW public.items AS SELECT * FROM player_one.items;

-- 5. Grant permissions on tables and views
GRANT ALL ON ALL TABLES IN SCHEMA player_one TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA player_one TO anon;

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
