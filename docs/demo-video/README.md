# QAME 概念介绍视频

一条 1920×1080 画面 · 轨 1 中文 / 轨 2 英文 · 烧录双语字幕。

## 重做三步

```bash
cd docs/demo-video
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
./scripts/generate_audio.sh
.venv/bin/python record_demo.py
./scripts/mux_dual_audio.sh
```

成片：`capture/QAME-concept-dual-audio.mp4`

播放器里选 **Chinese / English** 音轨。可选静帧：`scenes/stills/s0.png` … `s6.png`（`gpt-image-2-prompts.md`）。

Chromium 可指定：`PLAYWRIGHT_CHROME=/path/to/chrome .venv/bin/python record_demo.py`
