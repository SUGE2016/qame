# 素材 BOM

| ID | 类型 | 来源 | 用途 |
|----|------|------|------|
| A-zh / A-en | 分镜 WAV | `scripts/generate_audio.sh` | 每镜双音轨 |
| V-S0…V-S7 | 1920×1080 分镜录屏 | `record_clip.py S0` … | 验收 clip |
| C-s0…C-s7 | 概念卡 / 三栏赛场 | HTML 自绘 | 不阻塞真厅 |
| SRT | 每镜 zh / en / bilingual | `scripts/build_subtitles.py` | 烧录 + 交付 |
| Mux-clip | `capture/S0-dual-audio.mp4` … | `scripts/mux_clip.sh S0` | **先验收** |
| Mux-final | 单 mp4 | `scripts/mux_dual_audio.sh` | **验收通过后再跑** |

大文件：`capture/`、`audio/*.wav`（gitignore）。
