#!/usr/bin/env python3
"""Restore one stable Android key from private Storage; bootstrap only a new bucket.

Uses the existing CI Supabase service-role secret. No key, password, or signed
URL is printed, committed, cached by Actions, or uploaded as a build artifact.
An existing bucket with a missing/corrupt key fails closed, never rotates keys.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.error
import urllib.request

PROJECT_URL = 'https://yvoylicirtdarroqcxoq.supabase.co'
BUCKET = 'elomara-android-signing'
OBJECT = 'signing-v1.json'


def request(method, path, token, body=None):
    headers = {'Authorization': f'Bearer {token}', 'apikey': token}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(PROJECT_URL + '/storage/v1/' + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        response = error.read()
        # Storage may wrap an object/bucket 404 in an HTTP 400 response.
        try:
            detail = json.loads(response)
            if error.code in (400, 404) and str(detail.get('statusCode')) == '404':
                return 404, response
        except (ValueError, TypeError):
            pass
        return error.code, response


def keytool(arguments, password, **kwargs):
    env = dict(os.environ, ELOMARA_KEY_PASSWORD=password)
    return subprocess.run(['keytool', *arguments], env=env, check=True, capture_output=True, **kwargs)


def restore(workdir, token, github_env=None):
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True, mode=0o700)
    workdir.chmod(0o700)
    bundle_file = os.environ.get('NEON_SIGNING_BUNDLE_FILE')
    if bundle_file:
        # The migration downloads the original private object, never a new key.
        bundle = json.loads(Path(bundle_file).read_bytes())
        key_path = workdir / 'elomara-android.p12'
    else:
        status, response = request('GET', 'bucket/' + BUCKET, token)
        created = False
        if status == 404:
            payload = {'id': BUCKET, 'name': BUCKET, 'public': False, 'file_size_limit': 1048576, 'allowed_mime_types': ['application/json']}
            status, response = request('POST', 'bucket', token, json.dumps(payload).encode())
            created = status in (200, 201)
            if not created:
                # Another build may have initialized it. Never overwrite its key.
                status, response = request('GET', 'bucket/' + BUCKET, token)
        if status not in (200, 201):
            raise RuntimeError(f'Cannot access private Android signing bucket (HTTP {status})')
        # Some create responses only return a name; always check the actual access mode.
        status, response = request('GET', 'bucket/' + BUCKET, token)
        if status != 200 or json.loads(response).get('public') is not False:
            raise RuntimeError('Android signing bucket must be private')
        status, response = request('GET', f'object/authenticated/{BUCKET}/{OBJECT}', token)
        key_path = workdir / 'elomara-android.p12'
        if status == 404 and created:
            password = secrets.token_urlsafe(48)
            alias = 'elomara-android'
            keytool(['-genkeypair', '-keystore', str(key_path), '-storetype', 'PKCS12', '-storepass:env', 'ELOMARA_KEY_PASSWORD', '-keypass:env', 'ELOMARA_KEY_PASSWORD', '-alias', alias, '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Elomara Android,O=Elomara,C=EG'], password)
            cert = keytool(['-exportcert', '-keystore', str(key_path), '-storepass:env', 'ELOMARA_KEY_PASSWORD', '-alias', alias], password).stdout
            bundle = {'version': 1, 'keystore': base64.b64encode(key_path.read_bytes()).decode(), 'password': password, 'alias': alias, 'certificate_sha256': hashlib.sha256(cert).hexdigest()}
            payload = json.dumps(bundle).encode()
            status, response = request('POST', f'object/{BUCKET}/{OBJECT}', token, payload)
            if status not in (200, 201):
                raise RuntimeError(f'Cannot persist Android signing key; refusing to publish (HTTP {status})')
            # Verify persisted bytes before using the new identity to sign any APK.
            status, response = request('GET', f'object/authenticated/{BUCKET}/{OBJECT}', token)
            if status != 200 or json.loads(response) != bundle:
                raise RuntimeError('Persisted Android signing key could not be verified')
        elif status != 200:
            raise RuntimeError(f'Stable Android key unavailable (HTTP {status}); restore the private key, do not generate a replacement')
        else:
            bundle = json.loads(response)
    if bundle.get('version') != 1 or not bundle.get('password') or not bundle.get('alias'):
        raise RuntimeError('Invalid Android signing bundle')
    key_path.write_bytes(base64.b64decode(bundle['keystore'], validate=True))
    key_path.chmod(0o600)
    cert = keytool(['-exportcert', '-keystore', str(key_path), '-storepass:env', 'ELOMARA_KEY_PASSWORD', '-alias', bundle['alias']], bundle['password']).stdout
    fingerprint = hashlib.sha256(cert).hexdigest()
    if fingerprint != bundle['certificate_sha256']:
        raise RuntimeError('Android signing certificate mismatch')
    config = workdir / 'signing-config.json'
    config.write_text(json.dumps({'storeFile': str(key_path.resolve()), 'storePassword': bundle['password'], 'keyAlias': bundle['alias'], 'keyPassword': bundle['password']}))
    config.chmod(0o600)
    if github_env:
        with open(github_env, 'a') as env_file:
            env_file.write(f'ELOMARA_SIGNING_CONFIG={config.resolve()}\n')
    print('Stable Android certificate SHA-256: ' + fingerprint)
    return fingerprint


if __name__ == '__main__':
    token = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not token and not os.environ.get('NEON_SIGNING_BUNDLE_FILE'):
        raise SystemExit('SUPABASE_SERVICE_ROLE_KEY is required for stable private Android signing')
    restore(os.environ['SIGNING_WORKDIR'], token, os.environ.get('GITHUB_ENV'))
