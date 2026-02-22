#!/usr/bin/env python3
"""Generate finance-dl config for Capital One, MACU, M1 Finance."""
import json, os, sys, argparse
from pathlib import Path


INSTITUTION_MODULES = {
    'capitalone': 'finance_dl.capitalone',
    'macu':       'finance_dl.mountain_america',
    'm1finance':  'finance_dl.m1finance',
}

ENV_KEYS = {
    'capitalone': ('CAPITALONE_USERNAME', 'CAPITALONE_PASSWORD'),
    'macu':       ('MACU_USERNAME',       'MACU_PASSWORD'),
    'm1finance':  ('M1_USERNAME',         'M1_PASSWORD'),
}


def build_config(institutions, downloads_dir):
    cfg = {}
    for inst in institutions:
        ukey, pkey = ENV_KEYS.get(inst, (None, None))
        if not ukey:
            continue
        username = os.environ.get(ukey, '')
        password = os.environ.get(pkey, '')
        if not username or not password:
            print(f'[finance-dl] No credentials for {inst}, skipping', file=sys.stderr)
            continue
        out_dir = os.path.join(downloads_dir, inst)
        Path(out_dir).mkdir(parents=True, exist_ok=True)
        cfg[inst] = {
            'module':           INSTITUTION_MODULES[inst],
            'username':         username,
            'password':         password,
            'output_directory': out_dir,
            'output_format':    'ofx',
        }
    return cfg


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--institutions', nargs='+', default=list(INSTITUTION_MODULES.keys()))
    parser.add_argument('--downloads-dir', default=os.environ.get('DOWNLOADS_DIR', '/app/downloads'))
    args = parser.parse_args()

    cfg = build_config(args.institutions, args.downloads_dir)
    if not cfg:
        print(json.dumps({'status': 'error', 'message': 'No credentials configured'}))
        sys.exit(1)

    # Write config file for finance-dl
    config_path = '/tmp/financedl_config.py'
    with open(config_path, 'w') as f:
        f.write('data_sources = {\n')
        for key, val in cfg.items():
            f.write(f'    {json.dumps(key)}: {json.dumps(val)},\n')
        f.write('}\n')

    print(json.dumps({'status': 'ok', 'config': config_path, 'sources': list(cfg.keys())}))
