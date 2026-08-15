# QAME 双 Agent 对战宣传片（2026-08-15）

一条 1920×1080 画面 · 轨 1 中文 / 轨 2 英文 · 烧录双语字幕。  
**一镜一 clip，验收通过后再合并。**

## 分镜 clip

```bash
cd docs/demo-video-0815
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
./scripts/generate_audio.sh
.venv/bin/python record_clip.py --all
./scripts/mux_clip.sh --all
```

单镜：`.venv/bin/python record_clip.py S4` 然后 `./scripts/mux_clip.sh S4`  
验收文件：`capture/S0-dual-audio.mp4` … `S7-dual-audio.mp4`

## 合并（全部验收后再跑）

```bash
./scripts/mux_dual_audio.sh
```

成片：`capture/QAME-agents-dual-audio.mp4`

播放器里选 **Chinese / English** 音轨。
