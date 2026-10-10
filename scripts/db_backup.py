#!/usr/bin/env python3
"""
Encrypted logical backup of the production database via the Supabase CLI.

Rows are fetched through `supabase db query --linked` (read-only SELECTs),
held in memory, and piped straight into `openssl enc`, which prompts for a
passphrase on the terminal. Plaintext is never written to disk.

Usage (run from the repo root with `python3 -I`):
  scripts/db_backup.py backup [--out DIR]   write an encrypted backup
  scripts/db_backup.py backup --dry-run     fetch and report counts only
  scripts/db_backup.py verify FILE          decrypt in memory, compare counts with production
  scripts/db_backup.py restore-sql FILE     decrypt and print restore SQL to stdout

The restore SQL expects a database with the repo migrations applied and no
existing rows. Never run it against production.
"""
import argparse
import datetime
import hashlib
import json
import os
import secrets
import subprocess
import sys

PROJECT_REF = 'bnflsokqzaoxmwhzrpwv'
# Restore order respects foreign keys.
TABLES = [
    'auth.users',
    'auth.identities',
    'public.user_settings',
    'public.check_ins',
    'public.cl_history',
    'public.threshold_data',
]
OPENSSL = ['openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', '600000', '-salt']
DEFAULT_OUT = os.path.expanduser('~/app-migraine-backups')


def query(sql):
    result = subprocess.run(
        ['supabase', 'db', 'query', '--linked', '--agent', 'no', '--output-format', 'json', sql],
        capture_output=True, text=True,
    )
    out = result.stdout
    starts = [i for i in (out.find('['), out.find('{')) if i >= 0]
    if result.returncode != 0 or not starts:
        sys.exit(f'Query failed: {result.stderr.strip() or out.strip()}')
    data = json.loads(out[min(starts):])
    # Plain terminals get a bare array; agent mode wraps rows in an object.
    return data['rows'] if isinstance(data, dict) else data


def fetch_bundle():
    tables = {}
    for table in TABLES:
        schema, name = table.split('.')
        columns = [r['column_name'] for r in query(
            "select column_name from information_schema.columns "
            f"where table_schema = '{schema}' and table_name = '{name}' "
            "and is_generated = 'NEVER' and generation_expression is null "
            "order by ordinal_position"
        )]
        column_list = ', '.join(f'"{c}"' for c in columns)
        rows = query(
            f'select coalesce(json_agg(t), \'[]\'::json) as rows '
            f'from (select {column_list} from {table}) t'
        )[0]['rows']
        tables[table] = {'columns': columns, 'rows': rows}
    migrations = [r['version'] for r in query(
        'select version from supabase_migrations.schema_migrations order by version'
    )]
    return {
        'format': 1,
        'project_ref': PROJECT_REF,
        'captured_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'migrations': migrations,
        'tables': tables,
    }


def counts(bundle):
    return {t: len(v['rows']) for t, v in bundle['tables'].items()}


def live_counts():
    selects = ', '.join(f"(select count(*) from {t}) as \"{t}\"" for t in TABLES)
    return query(f'select {selects}')[0]


def decrypt(path):
    with open(path, 'rb') as f:
        result = subprocess.run(OPENSSL + ['-d'], stdin=f, capture_output=True)
    if result.returncode != 0:
        sys.exit('Decryption failed (wrong passphrase or corrupt file).')
    return json.loads(result.stdout)


def restore_sql(bundle):
    lines = [
        f"-- Restore of {bundle['project_ref']} captured {bundle['captured_at']}",
        f"-- Expected migrations: {', '.join(bundle['migrations'])}",
        'begin;',
    ]
    for table in TABLES:
        data = bundle['tables'][table]
        if not data['rows']:
            continue
        payload = json.dumps(data['rows'], ensure_ascii=False)
        tag = f'bk_{secrets.token_hex(8)}'
        assert f'${tag}$' not in payload
        cols = ', '.join(f'"{c}"' for c in data['columns'])
        lines.append(
            f'insert into {table} ({cols}) select {cols} '
            f'from json_populate_recordset(null::{table}, ${tag}${payload}${tag}$::json);'
        )
    lines.append('commit;')
    return '\n'.join(lines) + '\n'


def cmd_backup(args):
    bundle = fetch_bundle()
    plaintext = json.dumps(bundle, ensure_ascii=False).encode()
    print(f'Fetched {counts(bundle)}; migrations {bundle["migrations"]}', file=sys.stderr)
    if args.dry_run:
        sql = restore_sql(bundle)
        print(f'Dry run: {len(plaintext)} bytes of data, {len(sql)} bytes of restore SQL. Nothing written.',
              file=sys.stderr)
        return

    os.makedirs(args.out, mode=0o700, exist_ok=True)
    os.chmod(args.out, 0o700)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    path = os.path.join(args.out, f'app-migraine-{stamp}.json.enc')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as f:
        # openssl prompts for the passphrase (twice) on the terminal.
        result = subprocess.run(OPENSSL + ['-e'], input=plaintext, stdout=f)
    if result.returncode != 0:
        os.remove(path)
        sys.exit('Encryption failed; no backup written.')
    with open(path, 'rb') as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    print(f'Wrote {path}\nsha256 {digest}', file=sys.stderr)


def cmd_verify(args):
    bundle = decrypt(args.file)
    stored, live = counts(bundle), live_counts()
    ok = True
    for table in TABLES:
        mark = 'ok' if stored[table] == live[table] else 'DIFFERS'
        ok &= mark == 'ok'
        print(f'{table:24} backup {stored[table]:>4}  production {live[table]:>4}  {mark}')
    print(f'Captured {bundle["captured_at"]}; migrations {bundle["migrations"]}')
    sys.exit(0 if ok else 1)


def cmd_restore_sql(args):
    sys.stdout.write(restore_sql(decrypt(args.file)))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('backup')
    p.add_argument('--out', default=DEFAULT_OUT)
    p.add_argument('--dry-run', action='store_true')
    p.set_defaults(func=cmd_backup)
    p = sub.add_parser('verify')
    p.add_argument('file')
    p.set_defaults(func=cmd_verify)
    p = sub.add_parser('restore-sql')
    p.add_argument('file')
    p.set_defaults(func=cmd_restore_sql)
    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
