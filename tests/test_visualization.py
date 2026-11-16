"""Visualizers can open user data without a repository demo directory."""
import tempfile
import unittest
from importlib.util import find_spec
from pathlib import Path

import numpy as np

from humancoin import HumanCOINDataset


class VisualizationTests(unittest.TestCase):
    @unittest.skipUnless(find_spec("matplotlib") and find_spec("scipy"), "requires visualization dependencies")
    def test_desktop_and_web_open_arbitrary_dataset(self):
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from humancoin.visualization.desktop import Visualizer
        from humancoin.visualization.web import DatasetApp, HTML_PATH

        self.assertIn(b"<html", HTML_PATH.read_bytes().lower())
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "recording"
            dataset = HumanCOINDataset.create(
                repo_id="test", root=root, fps=10,
                features={"observation.state": {
                    "dtype": "float32", "shape": (1,), "names": ["value"], "fps": 10,
                }},
            )
            for i in range(3):
                dataset.add_frame("task", "test", timestamp=i / 10)
                dataset.add_frame("observation.state", np.array([i], dtype=np.float32), timestamp=i / 10)
            dataset.save_episode()
            loaded = HumanCOINDataset(repo_id="test", root=root)
            viewer = Visualizer(loaded)
            try:
                viewer._draw()
                viewer.fig.canvas.draw()
                self.assertEqual(viewer.n_frames, 3)
                with self.assertRaisesRegex(ValueError, "no frames"):
                    Visualizer(loaded, ep_idx=99)
            finally:
                plt.close("all")
            app = DatasetApp(root)
            self.assertEqual(len(app.dataset_summary()["episodes"]), 1)
            self.assertIn("observation.state", app.frame_data(0, 1, 0, 0.2, {}, {})["samples"])
