@echo off
chcp 65001 >nul
title Proxmox VE Windows Anti-VM Verification
echo ======================================================================
echo   Running Verify-AntiVM.ps1 ...
echo ======================================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Verify-AntiVM.ps1" -ReportDir "%TEMP%\AntiVM_Reports"
echo.
echo Press any key to exit (or run Install-And-Run-Suites.ps1 for Pafish/VMAware)...
pause >nul
