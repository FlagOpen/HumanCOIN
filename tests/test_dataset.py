"""Round-trip contracts for independent-rate sensors, audio and native depth."""
import tempfile
import unittest
from pathlib import Path

import av
import numpy as np
import torch

from humancoin_lerobot import HumancoinLeRobotDataset
from humancoin_lerobot.video import VideoFeature


class DatasetTests(unittest.TestCase):
    def test_multirate_numeric_and_variable_audio_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'recording'
            ds = HumancoinLeRobotDataset.create(
                repo_id='test', root=root, fps=10,
                features={
                    'observation.imu': {'dtype':'float32','shape':(2,), 'names':['x','y'],
                                        'fps':100, 'window':(-0.1,0)},
                    'observation.state': {'dtype':'float32','shape':(1,), 'names':['position'], 'fps':10},
                    'observation.audio.mic': {'dtype':'audio','shape':(5,), 'names':None, 'sample_rate':100},
                })
            for i in range(30):
                ds.add_frame('observation.imu', np.array([i, -i], dtype=np.float32), timestamp=i/100)
            for i in range(3):
                ds.add_frame('task', 'test activity', timestamp=i/10)
                ds.add_frame('observation.state', np.array([i], dtype=np.float32), timestamp=i/10)
            for timestamp, count in [(0,5),(0.05,6),(0.11,7)]:
                ds.add_frame('observation.audio.mic', np.full(count,0.25,dtype=np.float32), timestamp=timestamp)
            ds.save_episode()
            loaded = HumancoinLeRobotDataset(repo_id='test', root=root)
            self.assertEqual(len(loaded),3)
            item = loaded[1]
            self.assertEqual(item['task'],'test activity')
            np.testing.assert_array_equal(item['observation.state'].numpy(),[1])
            np.testing.assert_array_equal(item['observation.imu'].numpy()[:,0],np.arange(1,11))
            self.assertEqual(tuple(loaded[0]['observation.audio.mic'].shape),(5,))
            np.testing.assert_allclose(loaded[0]['observation.audio.mic'].numpy(),0.25,atol=1/32767)
            self.assertAlmostEqual(float(loaded.meta.stats['observation.audio.mic']['mean'][0]),0.25)

    def test_native_depth_preserves_values_during_random_access(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            spec={'dtype':'video','shape':(16,16,1),'fps':10,
                  'info':{'video.is_depth_map':True}}
            feature=VideoFeature('depth',spec,root)
            path=root/'videos/chunk-000/depth/episode_000000.mp4'
            path.parent.mkdir(parents=True)
            # Lossless fixture: container format is detected from content on read.
            with av.open(str(path),'w',format='matroska') as container:
                stream=container.add_stream('ffv1',rate=10)
                stream.width=16;stream.height=16;stream.pix_fmt='gray16le'
                for i in range(3):
                    frame=av.VideoFrame.from_ndarray(np.full((16,16),1000+i*500,dtype=np.uint16),format='gray16le')
                    for packet in stream.encode(frame):container.mux(packet)
                for packet in stream.encode():container.mux(packet)
            feature._ts_cache[0]=np.array([0,.1,.2])
            for i in [2,0,1]:
                result=feature.read(0,i/10)
                self.assertEqual(result.dtype,torch.uint16)
                self.assertEqual(tuple(result.shape),(1,16,16))
                np.testing.assert_array_equal(result.numpy(),1000+i*500)


if __name__=='__main__':
    unittest.main()
