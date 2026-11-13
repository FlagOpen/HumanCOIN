"""Download routing tests: never contact hubs or download dataset contents."""
import contextlib
import io
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from humancoin_lerobot.download import _error_detail, download_dataset, main, resolve_repo_id


class DownloadTests(unittest.TestCase):
    def test_names(self):
        self.assertEqual(resolve_repo_id('session-001'), 'HumanCOIN/session-001')
        self.assertEqual(resolve_repo_id('Other/session'), 'Other/session')
        for name in ('../bad', '/tmp/data', 'HumanCOIN/../bad', '', 'a/b/c'):
            with self.assertRaises(ValueError):
                resolve_repo_id(name)

    def test_huggingface(self):
        sdk = types.ModuleType('huggingface_hub')
        sdk.snapshot_download = Mock()
        with tempfile.TemporaryDirectory() as root, patch.dict(sys.modules, huggingface_hub=sdk), patch.dict(os.environ, {'HF_TOKEN': 'test-token'}):
            result = download_dataset('session', target_dir=root, revision='v1', max_workers=2)
            self.assertEqual(result, Path(root) / 'HumanCOIN/session')
            sdk.snapshot_download.assert_called_once_with(
                repo_id='HumanCOIN/session', repo_type='dataset', token='test-token',
                local_dir=str(result), max_workers=2, revision='v1')

    def test_modelscope(self):
        api = types.ModuleType('modelscope_hub')
        api.HubApi = Mock()
        modules = {'modelscope_hub': api}
        with tempfile.TemporaryDirectory() as root, patch.dict(sys.modules, modules):
            result = download_dataset('session', hub='modelscope', target_dir=root, token='test-token')
            api.HubApi.assert_called_once_with(token='test-token')
            api.HubApi.return_value.download_repo.assert_called_once_with(
                repo_id='HumanCOIN/session', repo_type='dataset', local_dir=str(result), max_workers=8)

    def test_pattern_filters_and_ms_token_alias(self):
        api = types.ModuleType('modelscope_hub')
        api.HubApi = Mock()
        with tempfile.TemporaryDirectory() as root, patch.dict(sys.modules, modelscope_hub=api), patch.dict(os.environ, {'MS_TOKEN': 'test-token'}, clear=True):
            download_dataset('session', hub='modelscope', target_dir=root,
                             allow_patterns=['meta/*'], ignore_patterns=['*.tmp'])
            api.HubApi.assert_called_once_with(token='test-token')
            kwargs = api.HubApi.return_value.download_repo.call_args.kwargs
            self.assertEqual(kwargs['allow_patterns'], ['meta/*'])
            self.assertEqual(kwargs['ignore_patterns'], ['*.tmp'])

    def test_error_details_redact_tokens(self):
        error = Exception('do not expose arbitrary exception strings')
        error.response = Mock(status_code=403)
        error.response.json.return_value = {'error': 'Denied hf_private Bearer hidden explicit-token'}
        detail = _error_detail(error, 'explicit-token')
        self.assertIn('HTTP 403', detail)
        for secret in ('hf_private', 'hidden', 'explicit-token'):
            self.assertNotIn(secret, detail)

    def test_cli_import_does_not_load_core_dependencies(self):
        import subprocess
        result = subprocess.run([sys.executable, '-c',
            "import sys; import humancoin_lerobot.download; "
            "assert not any(n in sys.modules for n in ('torch', 'lerobot', 'numpy', 'pyarrow'))"],
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_dry_run_has_no_side_effects(self):
        with tempfile.TemporaryDirectory() as root, patch('humancoin_lerobot.download.download_dataset') as download, contextlib.redirect_stdout(io.StringIO()) as output:
            target = Path(root) / 'absent'
            self.assertEqual(main(['--datasets', 'session', 'HumanCOIN/session', '--target-dir', str(target), '--dry-run']), 0)
            download.assert_not_called()
            self.assertFalse(target.exists())
            self.assertEqual(output.getvalue().count('HumanCOIN/session ->'), 1)

    def test_batch_continues_after_failure(self):
        with patch('humancoin_lerobot.download.download_dataset', side_effect=[RuntimeError('secret'), Path('/tmp/ok')]) as download, contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()) as errors:
            self.assertEqual(main(['--datasets', 'bad', 'ok']), 1)
            self.assertEqual(download.call_count, 2)
            self.assertNotIn('secret', errors.getvalue())


if __name__ == '__main__':
    unittest.main()
