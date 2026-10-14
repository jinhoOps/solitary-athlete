-- Disposable PostgreSQL cluster ONLY; existing roles cause rollback.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA solitary_athlete;
GRANT USAGE ON SCHEMA solitary_athlete TO anon, authenticated, service_role;
CREATE SCHEMA player_one;
CREATE TABLE player_one.existing_app_fixture(id integer PRIMARY KEY);
INSERT INTO player_one.existing_app_fixture VALUES (1);
GRANT USAGE ON SCHEMA player_one TO anon, authenticated, service_role;
GRANT SELECT ON player_one.existing_app_fixture TO anon;
COMMIT;
