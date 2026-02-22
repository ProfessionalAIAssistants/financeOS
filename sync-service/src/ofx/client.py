#!/usr/bin/env python3
"""OFX Direct Connect client for Chase and USAA."""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

try:
    from ofxtools.Client import OFXClient, StmtRq
    from ofxtools.utils import UTC
    HAS_OFXTOOLS = True
except ImportError:
    HAS_OFXTOOLS = False

INSTITUTIONS = {
    'chase': {
        'url': 'https://ofx.chase.com',
        'fid': '10898',
        'org': 'B1',
        'bankid': '072000326',
    },
    'usaa': {
        'url': 'https://service2.usaa.com/ofx/OFXServer',
        'fid': '24591',
        'org': 'USAA',
        'bankid': '314074269',
    },
}


def download_ofx(institution: str, username: str, password: str,
                 days: int, output_dir: str) -> dict:
    if not HAS_OFXTOOLS:
        return {'success': False, 'error': 'ofxtools not installed', 'files': []}

    cfg = INSTITUTIONS.get(institution)
    if not cfg:
        return {'success': False, 'error': f'Unknown institution: {institution}', 'files': []}

    Path(output_dir).mkdir(parents=True, exist_ok=True)

    dtstart = datetime.now(UTC) - timedelta(days=days)
    dtend = datetime.now(UTC)

    try:
        client = OFXClient(
            cfg['url'],
            userid=username,
            userpass=password,
            org=cfg['org'],
            fid=cfg['fid'],
            version=220,
        )
        stmtrq = StmtRq(
            acctid='',
            accttype='CHECKING',
            dtstart=dtstart,
            dtend=dtend,
            bankid=cfg['bankid'],
        )
        response = client.request_statements(stmtrq)
        fname = os.path.join(output_dir, f"{institution}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.ofx")
        with open(fname, 'wb') as f:
            f.write(response.read())
        return {'success': True, 'files': [fname], 'institution': institution}
    except Exception as e:
        return {'success': False, 'error': str(e), 'files': [], 'institution': institution}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--institution', required=True, choices=list(INSTITUTIONS.keys()))
    parser.add_argument('--days', type=int, default=30)
    parser.add_argument('--output', default='/app/downloads')
    args = parser.parse_args()

    username = os.environ.get(f'{args.institution.upper()}_USERNAME', '')
    password = os.environ.get(f'{args.institution.upper()}_PASSWORD', '')

    if not username or not password:
        print(json.dumps({'success': False, 'error': 'Missing credentials', 'files': []}))
        sys.exit(1)

    result = download_ofx(args.institution, username, password, args.days,
                          os.path.join(args.output, args.institution))
    print(json.dumps(result))
    sys.exit(0 if result['success'] else 1)
