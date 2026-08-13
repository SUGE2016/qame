# 素材 BOM

| ID | 类型 | 来源 | 用途 |
|----|------|------|------|
| A-zh / A-en | 旁白 WAV | `scripts/generate_audio.sh` | 双音轨 |
| V-screen | 1920×1080 录屏 | `record_demo.py` → `scenes/index.html` | 成片画面 |
| C-s0…C-s6 | 概念卡 | HTML 自绘 | 不阻塞；可选 GPT 图替换背景 |
| SRT | zh / en / bilingual | `scripts/build_subtitles.py` | 烧录 + 交付 |
| Mux | mp4 | `scripts/mux_dual_audio.sh` | 成片 |

大文件：`capture/`、`audio/*.wav`（gitignore）。

## 可选：你用 gpt-image-2 生成的静帧

不需要也能成片。若要更厚的插画质感，把图放到 `scenes/stills/` 并命名为 `s0.png`…`s6.png`（1920×1080），HTML 会自动铺底。提示词见 `gpt-image-2-prompts.md`。
