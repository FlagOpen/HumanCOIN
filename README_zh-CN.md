# HumanCOIN

<p align="center">
  <img src="assets/cover.jpg" alt="HumanCOIN：三层测量、代理信号与场景覆盖" width="100%">
</p>

**一个 12,500 小时的第一视角操作数据集：在统一任务本体与统一时间轴上，按三种测量深度记录动作背后的意图信号——注视、表面肌电与脑电。**

<p align="center">
  <a href="https://flagopen.github.io/HumanCOIN/">项目主页</a> ·
  <a href="https://arxiv.org/abs/2611.26434">技术报告</a> ·
  <a href="https://flagopen.github.io/HumanCOIN-Doc/zh/">文档</a> ·
  <a href="https://flagopen.github.io/HumanCOIN-DataManager/">数据门户</a> ·
  <a href="#交流群">交流群</a>
</p>

> English: [README.md](README.md)

<p align="center">
  <img src="assets/wecom-group.png" alt="HumanCOIN 企业微信交流群二维码" width="150">
  <br>
  <sub>有问题、有想法，都来群里聊。</sub>
</p>

## 这是什么？

大多数第一视角数据集只保留观测–动作对。在这样的数据上训练策略，学到的是 `π(a | o)`，操作者的意图被折进权重；策略失败时，数据无法说明是目标错了、握力判断错了，还是漏掉了某个误差信号。

HumanCOIN 记录这条通路的中段。每条 episode 都带有可穿戴的意图代理：

- **注视**——手出发之前，注意力落在哪里；
- **表面肌电**——接触之前，前臂如何为握力加载；
- **头皮脑电**——运动命令下达之前，皮层准备了什么。

这些是测量和估计，不是意图真值。语料支持学习代理模型 `p(m | o)`、训练以意图为条件的策略 `p(a | o, m)`，并与 `p(a | o)` 对比。受控 L3 直接测量注视、位姿和手指运动学，为浅层估计提供可对照的参考。

## 一览

| 维度 | 数值 |
|------|------|
| 规模 | 12,500 小时 · 30 fps 下约 13.5 亿个主帧 · 6 个采集点 |
| 场景 | 5 个功能区共 38 类 + 1 个残差类 |
| 任务 | 99 个任务动词 + 46 个动作动词 |
| 物体 | 635 个标注类别；839 个实测实例 |
| 信号 | 多视角 RGB、度量深度与点云、6-DoF 位姿、手部运动学、注视、sEMG、EEG、IMU、麦克风 |
| 格式 | LeRobot 风格：每个数据流一个 Parquet，外加主索引、MP4 视频与 WAV 音频 |
| 许可 | 数据 CC BY-NC 4.0；代码 Apache-2.0 |

<p align="center">
  <img src="assets/overview.jpg" alt="HumanCOIN 数据分布：层级、片段长度、场景、动词与物体" width="100%">
  <br>
  <sub>一图看全：三层小时数、episode 长度、任务深度、38 类场景、任务动词与 635 类物体。图源：技术报告。</sub>
</p>

## 快速开始

### 1. 安装

```bash
pip install -U "humancoin>=0.1.1"
```

支持 Python 3.10–3.13。包固定 LeRobot 0.3.3，并自带下载器、数据读取器和两个可视化器。

### 2. 下载一个仓库

打开 **[数据门户](https://flagopen.github.io/HumanCOIN-DataManager/)**，勾选仓库，选择 Hugging Face 或 ModelScope，然后点 **Generate Download Command**。下面是一个 65 MB 的 L1 示例：

```bash
humancoin-download --hub huggingface \
  --datasets 'HumanCOIN/l1_study_room_fill_task_1920x1456_30fps_2views' \
  --revision 'b1b5d76c9a06d100733f4e4eac1a3e5f8942dfba' \
  --target-dir ./data --max-workers 8
```

<p align="center">
  <img src="assets/portal-explore.png" alt="HumanCOIN 数据门户：仓库卡片、筛选与下载操作" width="82%">
  <br>
  <sub>数据门户：筛选仓库、查看数据流与体积，再生成下载命令；受限仓库会在卡片上显示访问状态。</sub>
</p>

多数仓库是 gated：先在数据集页面申请访问，再执行 `hf auth login`。ModelScope 令牌和部分下载见[下载指南](https://flagopen.github.io/HumanCOIN-Doc/zh/download.html)。

### 3. 读一帧

```python
from pathlib import Path
from humancoin import HumanCOINDataset

REPO = "HumanCOIN/l1_study_room_fill_task_1920x1456_30fps_2views"
repo_dir = Path("data") / REPO
task_dir = repo_dir if (repo_dir / "meta/info.json").is_file() else next(
    p for p in sorted(repo_dir.iterdir()) if (p / "meta/info.json").is_file()
)

ds = HumanCOINDataset(repo_id=REPO, root=task_dir)
print(len(ds), "frames @", ds.fps, "fps")   # 882 frames @ 30.0 fps

frame = ds[0]
print(frame["observation.images.head_left_rectified"].shape)  # (3, 1456, 1920)
print(frame["observation.head_pose"].shape)                   # (7,)
print(frame["eye_gaze_predict"].shape)                        # (2,)
```

`ds[i]` 围绕第 i 个主时钟时间戳解析每一路数据流。没有数据流在写入时被预重采样，各自保留原生时钟。

### 4. 看一看

```bash
humancoin-visualize-web "<task-directory>"
```

浏览器界面默认打开 `http://127.0.0.1:8000`，包含同步相机、信号条、3D 位姿和滤波。

<p align="center">
  <img src="assets/visualizer.png" alt="真实 L3 episode 的 HumanCOIN 浏览器可视化器" width="100%">
  <br>
  <sub>真实 L3 episode 的浏览器界面：相机墙、3D 位姿，以及共用主时间轴的肌电/IMU/注视。</sub>
</p>

## 三个层级

每层继承下一层的代理信号，再增加一种。

| 层级 | 小时数 | 新增信号 | 视角 | 环境 |
|------|--------|----------|------|------|
| **L1 · 注意** | 10,000 | 从头环视频估计注视 | 2–6 路头部相机、深度、位姿 | 开放，不设脚本 |
| **L2 · 用力** | 2,000 | 双侧 sEMG，每臂 8 通道 @ 2 kHz | 4 目头环、2 路腕部视角 | 开放，任务单 |
| **L3 · 认知** | 500 | EEG，受控 128 通道 @ 1 kHz，开放 32/8 通道 @ 250 Hz | 4 头部 + 2 腕部 + 眼动 + 第三人称 | 约 350 h 受控 + 150 h 开放 |

L1 不含肌电和脑电；L2 增加肌电；L3 增加脑电，并在受控子集中直接测量注视、位姿和手指运动学。

<p align="center">
  <img src="assets/scenes.jpg" alt="38 类场景各一张头戴相机画面" width="92%">
  <br>
  <sub>38 类场景各取一帧头戴相机画面，按功能区排列。图源：技术报告。</sub>
</p>

## 它有什么不同

- **意图代理是被测量的，不是被假设的。** 注视、肌电和脑电是独立数据流，实验可以检验它们是否带来观测之外的信息。
- **一条时钟，多种频率。** 30 fps 主索引加逐流时间戳；读取时解析、插值或开窗，不重写原始数据。
- **场景覆盖是设计的一部分。** 居住、商业、专业、工业、公共 5 个功能区共 38 类，另有长尾任务与物体。
- **受控参考确实存在。** L3 的实测注视与手部运动用于评估 L1/L2 的估计，而不是把预测当标签。
- **格式可读。** 每个数据流一个 Parquet，外加主索引、MP4、WAV 和标定文件。

## 使用数据

`ds[i]` 已经返回默认训练字段——`observation.images.*`、`observation.state`（通常 58 维）、`action`（58 维）和代理窗口——不需要先自己拼窗口数据集：

```python
item = ds[0]
print(item["observation.state"].shape)                  # [58]
print(item["action"].shape)                             # [58]
print(item["observation.eye_gaze"].shape)               # L3 上为 [N, 2]
print(item["observation.eeg_denoise"].shape)            # L3 上为 [N, 132]
```

键名随发布变化，使用前先打印 `ds.meta.features`。[使用指南](https://flagopen.github.io/HumanCOIN-Doc/zh/usage.html) 提供一个最小的 gaze/EMG/EEG 模型、padded collate，以及接入 LeRobot Diffusion Policy 的说明。它是接线 demo，不是生产训练配方。

## 文档

| 我想…… | 读 |
|--------|----|
| 安装并读出一帧 | [快速开始](https://flagopen.github.io/HumanCOIN-Doc/zh/getting-started.html) |
| 理解层级、场景与标注 | [数据里有什么](https://flagopen.github.io/HumanCOIN-Doc/zh/data.html) |
| 从门户或 ModelScope 下载 | [下载数据](https://flagopen.github.io/HumanCOIN-Doc/zh/download.html) |
| 理解 Parquet 布局与时间戳 | [磁盘上的格式](https://flagopen.github.io/HumanCOIN-Doc/zh/format.html) |
| 处理窗口与对齐 | [读取与对齐](https://flagopen.github.io/HumanCOIN-Doc/zh/reading.html) |
| 打开浏览器或桌面可视化器 | [可视化](https://flagopen.github.io/HumanCOIN-Doc/zh/visualization.html) |
| 用代理信号训练或评测 | [使用数据](https://flagopen.github.io/HumanCOIN-Doc/zh/usage.html) |
| 查看硬件与处理流程 | [采集与处理](https://flagopen.github.io/HumanCOIN-Doc/zh/collection.html) |
| 查 CLI、对比、FAQ 与引用 | [关于](https://flagopen.github.io/HumanCOIN-Doc/zh/reference.html) |

文档为双语：[English](https://flagopen.github.io/HumanCOIN-Doc/) · [中文](https://flagopen.github.io/HumanCOIN-Doc/zh/)。

## 引用

如果使用 HumanCOIN，请引用技术报告：

```bibtex
@article{wu2026humancoin,
  title   = {HumanCOIN: A 12,500-Hour Dataset for Human Intent in Egocentric Manipulation},
  author  = {Wu, Shihan and Liu, You and He, Chunyu and Qin, Minghui and Jiao, Longhan and
             Guo, Jinbang and Xie, Shaoxuan and Tian, Kaixi and Chen, Wenjie and Pang, Jingrui and
             Zhang, Yuanhang and Zhang, Yichi and Liu, Miao and Pan, Tengfei and Jiao, Yance and
             Zhang, Yunyan and Li, Yihang and Shen, Yongjian and Liu, Li and Zhu, Kai and
             Fang, Chen and Chen, Jianxing and Liu, Sihan and Wang, Xiaofeng and Zhao, Jie and
             Li, Jing and Wang, Yueqi and Tang, Yichen and Li, Wei and Yang, Zhexuan and Cao, Yue and
             Zhao, Ji and Wang, Kai and Jiang, Dongsheng and Wang, Yongwei and Mu, Wei and
             Pang, Jiangmiao and Yao, Maoqing and Ding, Wenchao and Zhu, Zheng and Xia, Zhongpu and
             Du, Dalong and Niu, Jianwei and Gao, Dahui and Yu, Zhiwei and Lei, Bo and Yang, Huan and
             Lin, Yonghua and Huang, Tiejun and Wang, Zhongyuan and Yao, Guocai},
  journal = {arXiv preprint arXiv:2611.26434},
  year    = {2026}
}
```

## 许可与合作机构

数据以 **CC BY-NC 4.0** 发布，仅限研究与非商业用途；代码使用 **Apache-2.0**。

<p align="center">
  <img src="assets/partners.png" alt="HumanCOIN 合作机构" width="100%">
</p>

## 交流群

数据访问、磁盘格式，或者第一帧就跑不通——都不算小问题，来群里问就好。

想一起把它做得更好也很欢迎：改文档、补例子、提建议、反馈数据集问题，都算贡献。进群打个招呼，我们帮你找个好上手的活儿。

<p align="center">
  <img src="assets/wecom-group.png" alt="HumanCOIN 企业微信交流群二维码" width="180">
  <br>
  <sub>企业微信扫码入群。</sub>
</p>

