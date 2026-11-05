"""Local, no-network regressions for the Render Reel workflow input boundary.

Run: python3 tests/render-workflow-security.test.py
No YAML package, real workflow dispatch, credentials, or rendering required.
"""
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest


WORKFLOW = Path(__file__).resolve().parents[1] / ".github/workflows/render-reel.yml"


def run_blocks():
    return re.findall(r"^        run: \|\n((?:          .*\n|\n)+)", WORKFLOW.read_text(), re.M)


def prep_script():
    return next(block for block in run_blocks() if 'OUTPUT_ID="$OUTPUT_ID_INPUT"' in block)


class RenderWorkflowSecurityTests(unittest.TestCase):
    def execute(self, value):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "github-output"
            env = {**os.environ, "OUTPUT_ID_INPUT": value, "GITHUB_OUTPUT": str(output)}
            result = subprocess.run(["bash", "-euo", "pipefail", "-c", prep_script()],
                                    cwd=directory, env=env, text=True, capture_output=True)
            files = {p.name for p in Path(directory).iterdir()}
            return result, output.read_text() if output.exists() else "", files

    def test_valid_id_is_preserved(self):
        result, output, _ = self.execute("reel-20261105_Test123")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, "output_id=reel-20261105_Test123\n")

    def test_missing_id_has_safe_fallback(self):
        result, output, _ = self.execute("")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertRegex(output, r"^output_id=reel-\d+\n$")

    def test_length_boundary(self):
        self.assertEqual(self.execute("a" * 64)[0].returncode, 0)
        self.assertNotEqual(self.execute("a" * 65)[0].returncode, 0)

    def test_shell_syntax_is_data_and_is_rejected(self):
        for value in ['$(touch injected)', '`touch injected`', '\"; touch injected; #',
                      'good\noutput_id=other', '../outside', 'two words', '.', '☃']:
            with self.subTest(value=value):
                result, output, files = self.execute(value)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(output, "")
                self.assertNotIn("injected", files)

    def test_no_github_expression_is_interpolated_into_shell(self):
        self.assertGreaterEqual(len(run_blocks()), 6)
        for block in run_blocks():
            self.assertNotIn("${{", block)

    def test_every_run_block_has_valid_bash_syntax(self):
        for block in run_blocks():
            result = subprocess.run(["bash", "-n"], input=block, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
