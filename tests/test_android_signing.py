"""Private signing persistence tests using a fake Storage API and real keytool."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('android_signing', ROOT / '.github/scripts/prepare_android_signing.py')
signing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signing)

class PrivateStorage:
    def __init__(self, exists=False, public=False):
        self.exists = exists
        self.public = public
        self.bundle = None
        self.uploads = 0

    def request(self, method, path, token, body=None):
        assert token == 'test-service-role'
        if path == 'bucket' and method == 'POST':
            data = json.loads(body)
            assert data['public'] is False
            self.exists = True
            return 200, b'{"name":"elomara-android-signing"}'
        if path == 'bucket/' + signing.BUCKET:
            return (200, json.dumps({'public': self.public}).encode()) if self.exists else (404, b'{}')
        if path.startswith('object/authenticated/'):
            return (200, self.bundle) if self.bundle else (404, b'{}')
        if path.startswith('object/') and method == 'POST':
            assert self.bundle is None, 'Existing private key must never be overwritten'
            self.bundle = body
            self.uploads += 1
            return 200, b'{}'
        raise AssertionError((method, path))

class SigningTests(unittest.TestCase):
    def test_neon_copy_restores_original_certificate_without_supabase_access(self):
        storage = PrivateStorage()
        with tempfile.TemporaryDirectory() as directory, patch.object(signing, 'request', storage.request):
            root = Path(directory)
            original = signing.restore(root / 'source', 'test-service-role')
            bundle = root / 'copied-bundle.json'
            bundle.write_bytes(storage.bundle)
            with patch.dict(os.environ, {'NEON_SIGNING_BUNDLE_FILE': str(bundle)}), patch.object(signing, 'request', side_effect=AssertionError('Supabase must not be accessed')):
                migrated = signing.restore(root / 'neon', '')
            self.assertEqual(original, migrated)
            self.assertEqual((root / 'source/elomara-android.p12').read_bytes(), (root / 'neon/elomara-android.p12').read_bytes())

    def test_two_builds_restore_the_same_private_identity(self):
        storage = PrivateStorage()
        with tempfile.TemporaryDirectory() as directory, patch.object(signing, 'request', storage.request):
            root = Path(directory)
            first = signing.restore(root / 'build-one', 'test-service-role')
            second = signing.restore(root / 'build-two', 'test-service-role')
            self.assertEqual(first, second)
            self.assertEqual(storage.uploads, 1)
            self.assertEqual((root/'build-one/elomara-android.p12').read_bytes(), (root/'build-two/elomara-android.p12').read_bytes())
            self.assertEqual((root/'build-two/signing-config.json').stat().st_mode & 0o777, 0o600)
            self.assertEqual((root/'build-two/elomara-android.p12').stat().st_mode & 0o777, 0o600)
            # An invalid stored identity must fail rather than rotate the signing key.
            bundle = json.loads(storage.bundle)
            bundle['certificate_sha256'] = 'invalid'
            storage.bundle = json.dumps(bundle).encode()
            with self.assertRaisesRegex(RuntimeError, 'certificate mismatch'):
                signing.restore(root / 'corrupt', 'test-service-role')
            self.assertEqual(storage.uploads, 1)

    def test_missing_existing_key_fails_without_rotation(self):
        storage = PrivateStorage(exists=True)
        with tempfile.TemporaryDirectory() as directory, patch.object(signing, 'request', storage.request):
            with self.assertRaisesRegex(RuntimeError, 'restore the private key'):
                signing.restore(directory, 'test-service-role')
            self.assertEqual(storage.uploads, 0)

    def test_public_storage_is_rejected(self):
        storage = PrivateStorage(exists=True, public=True)
        with tempfile.TemporaryDirectory() as directory, patch.object(signing, 'request', storage.request):
            with self.assertRaisesRegex(RuntimeError, 'must be private'):
                signing.restore(directory, 'test-service-role')
            self.assertEqual(storage.uploads, 0)

if __name__ == '__main__':
    unittest.main()
