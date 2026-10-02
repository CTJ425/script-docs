---
title: Ollama
status: using
summary: 在自己的機器上跑本地大型語言模型，搭配 Open WebUI 當介面。
url: https://ollama.com
repo: ollama/ollama
tags: [ollama, llm, docker]
scripts: [ollama]
---

我用 Docker Compose 跑它：預設走 NVIDIA GPU 加速，另外附了 CPU-only 的 override。設定與注意事項在 [Ollama + Open WebUI](../container/ollama)。
