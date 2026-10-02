---
title: 文件與腳本為什麼會各自漂移
date: 2026-10-02
summary: README 與腳本各走各的，是自動化腳本最常見的死法。我用單一來源、可預演、CI 守門三個約束擋住它。
tags: [ci, shell, docs]
scripts: [pve-link-iso]
---

自動化腳本最常見的死法不是寫錯邏輯，而是**文件與腳本各自漂移**：README 上的參數腳本早就改掉了，複製貼上的指令指向已經改名的 repo。

我的做法是用三個約束把漂移擋住。

## 單一來源

網站上每一個腳本頁，都是對應資料夾 `README.md` 的逐位元組渲染，不另外維護一份文案。文件與腳本永遠出自同一個 commit，不可能有「文件寫的是舊版」這種事。

## 可預演

會動到主機狀態的腳本一律支援 `--help` 與 `--dry-run`。先看它要做什麼，再決定要不要真的做。

例如 [Proxmox VE ISO 軟連結同步](../script/pve_link_iso)，第一次跑之前先預演：

```bash
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/pve_link_iso/pve_link_iso.sh | sudo bash -s -- --dry-run
```

## CI 守門

shell 語法與 ShellCheck、Docker Compose 設定、以及文件裡每一條 `raw.githubusercontent.com` 指令是否仍能解析，都在 CI 逐條驗證。貼出去的指令壞掉時，是我先知道，而不是複製它的人。

> [!NOTE]
> 這三件事保證的是「指令存在、語法正確、設定能解析」，不保證它在你的機器上一定能跑通。所以才有 `--dry-run`。
