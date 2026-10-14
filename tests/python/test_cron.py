import os
from pathlib import Path
import psycopg
import pytest
import hmac
import hashlib

def test_dispatch_calls_http_only_for_due_jobs_and_is_not_worker_callable():
    url=os.environ.get('TEST_DATABASE_URL')
    if not url:pytest.skip('isolated PostgreSQL required')
    with psycopg.connect(url) as conn:
        conn.execute('CREATE SCHEMA net; CREATE SCHEMA vault')
        conn.execute('CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions')
        conn.execute('''CREATE VIEW vault.decrypted_secrets AS SELECT * FROM
            (VALUES ('mukmuk_project_url','https://example.supabase.co'),
            ('mukmuk_cleanup_secret','fixture-secret')) AS s(name,decrypted_secret)''')
        conn.execute('CREATE TABLE net.requests(url text, headers jsonb, timeout integer)')
        conn.execute('''CREATE FUNCTION net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer)
            RETURNS bigint LANGUAGE sql AS $$
            INSERT INTO net.requests VALUES(url,headers,timeout_milliseconds) RETURNING 42::bigint $$''')
        conn.execute('TRUNCATE solitary_athlete.reply_cleanup_jobs')
        conn.commit()
        # The runner installs the production dispatch function in this isolated DB.
        assert conn.execute('SELECT solitary_athlete.mukmuk_dispatch_cleanup()').fetchone()[0] is None
        conn.execute('''INSERT INTO solitary_athlete.reply_cleanup_jobs
            (interaction_id,application_id,token_ciphertext,token_expires_at,status,published_at,delete_after)
            VALUES ('789','1559809751603216444',decode('01','hex'),now()+interval '15 minutes',
            'scheduled',now(),now()+interval '300 seconds')''')
        assert conn.execute('SELECT solitary_athlete.mukmuk_dispatch_cleanup()').fetchone()[0] is None
        conn.execute("UPDATE solitary_athlete.reply_cleanup_jobs SET published_at=now()-interval '301 seconds',delete_after=now()-interval '1 second'")
        assert conn.execute('SELECT solitary_athlete.mukmuk_dispatch_cleanup()').fetchone()[0]==42
        row=conn.execute('SELECT * FROM net.requests').fetchone()
        assert row[0]=='https://example.supabase.co/functions/v1/mukmuk-discord-cleanup'
        assert 'fixture-secret' not in str(row[1]) and row[2]==10000
        payload='mukmuk-cleanup-v1:'+row[1]['X-Mukmuk-Timestamp']+':'+row[1]['X-Mukmuk-Nonce']
        assert row[1]['X-Mukmuk-Signature']==hmac.new(b'fixture-secret',payload.encode(),hashlib.sha256).hexdigest()
        conn.commit()
        conn.execute('SET ROLE mukmuk_worker')
        with pytest.raises(psycopg.errors.InsufficientPrivilege):conn.execute('SELECT solitary_athlete.mukmuk_dispatch_cleanup()')
