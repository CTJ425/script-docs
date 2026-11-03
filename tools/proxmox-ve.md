---
title: Proxmox VE
status: using
summary: 家裡和實驗環境的虛擬化平台。
updated: 2026-11-03
url: https://www.proxmox.com/en/products/proxmox-virtual-environment/overview
tags: [proxmox, virtualization]
scripts: [pve-link-iso, apollo-windows-vm, pve-antivm]
---

和它有關、我自己寫的東西：

- [Proxmox VE ISO 軟連結同步](../script/pve_link_iso)：把放在 NAS 上的 ISO 用 symbolic link 掛進 PVE 的 ISO 目錄，不必複製檔案。
- [Proxmox VE 客製化 CPU 與反偵測 Windows 虛擬機（Anti-VM）](../script/pve-antivm)：設定 `cpu-models.conf` 隱藏 KVM 特徵（相容 Intel SR-IOV iGPU VF），並以真實消費級硬體範本建立高隱蔽性 Windows 11 虛擬機。
- [Apollo 串流主機（Proxmox VE 上的 Windows VM）](../script/apollo-windows-vm)：在 PVE 的 Windows VM 上部署 Apollo 虛擬螢幕串流主機與自動 DPI 縮放。
