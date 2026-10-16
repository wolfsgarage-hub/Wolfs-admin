#!/usr/bin/env python3
"""Bounded, non-publishing probe of the existing Studio proxy.

Default: OPTIONS and invalid-body POST for the two documented origins.
No credentials are read unless --with-token is explicitly selected; that option
reads WG_PROXY_TOKEN from the environment, never an argument or a file.
--generate makes ONE small paid diagnostic request on the established origin.
Output contains only status, classified responses, CORS and correlation IDs.
This is a command-line Origin probe, not browser/session authentication proof.
"""
import argparse
import json
import os
import re
import urllib.error
import urllib.request

ENDPOINT = 'https://pcqoivjzcokgdtlvoona.supabase.co/functions/v1/anthropic-proxy'
ORIGINS = ('https://wolfsgarage-hub.github.io', 'https://raw.githack.com')


def probe(origin, method, token='', generate=False):
    headers = {'Origin': origin, 'Content-Type': 'application/json'}
    if method == 'OPTIONS':
        headers.update({'Access-Control-Request-Method': 'POST',
                        'Access-Control-Request-Headers': 'content-type,x-wg-token'})
    elif token:
        headers['x-wg-token'] = token
    payload = {}
    if generate:
        payload = {'model': 'claude-sonnet-4-6', 'max_tokens': 32,
                   'system': 'Connectivity test. Reply exactly WG_DIAGNOSTIC_OK.',
                   'messages': [{'role': 'user', 'content': 'Reply WG_DIAGNOSTIC_OK.'}]}
    request = urllib.request.Request(ENDPOINT, method=method, headers=headers,
                                    data=json.dumps(payload).encode() if method == 'POST' else None)
    result = {'origin': origin, 'method': method, 'token_sent': bool(token and method == 'POST'),
              'generation_requested': generate}
    try:
        try:
            response = urllib.request.urlopen(request, timeout=60)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            result['status'] = response.status
            request_id = response.headers.get('sb-request-id', '')
            if re.fullmatch(r'[a-fA-F0-9-]{36}', request_id):
                result['request_id'] = request_id
            result['allow_origin'] = response.headers.get('Access-Control-Allow-Origin')
            result['allow_headers'] = response.headers.get('Access-Control-Allow-Headers')
            raw = response.read(65536)
        data = json.loads(raw) if raw else {}
        message = data.get('error', {}).get('message', '') if isinstance(data.get('error', {}), dict) else ''
        text = ''.join(b.get('text', '') for b in data.get('content', []) if isinstance(b, dict) and b.get('type') == 'text')
        if response.status == 204 and method == 'OPTIONS':
            result['result'] = 'preflight_only'
        elif response.status == 403 and message == 'Forbidden: request must come from an allowed site, or carry a valid x-wg-token.':
            result['result'] = 'origin_or_token_policy_denial'
        elif response.status == 400 and message == 'Body must include a non-empty messages array.':
            result['result'] = 'reached_body_validation_not_generation'
        elif generate and response.status == 200 and text.strip() == 'WG_DIAGNOSTIC_OK':
            result['result'] = 'exact_generation_reply_verified'
        else:
            result['result'] = 'unexpected_response_inspect_server_logs'
    except Exception:
        # Do not echo arbitrary exception text, headers, bodies or environment.
        result['result'] = 'transport_or_response_error_no_retry'
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--with-token', action='store_true')
    parser.add_argument('--generate', action='store_true')
    args = parser.parse_args()
    token = os.environ.get('WG_PROXY_TOKEN', '').strip() if args.with_token else ''
    if args.with_token and (not token or token.lower().startswith('sk-')):
        parser.error('Supply an existing WG proxy token in the environment, never a provider API key.')
    if args.generate:
        results = [probe(ORIGINS[1], 'POST', token, True)]
    else:
        results = [probe(origin, method, token) for origin in ORIGINS for method in ('OPTIONS', 'POST')]
    print(json.dumps(results, indent=2))
    return int(any(r['result'] in ('transport_or_response_error_no_retry', 'unexpected_response_inspect_server_logs') for r in results))


if __name__ == '__main__':
    raise SystemExit(main())
