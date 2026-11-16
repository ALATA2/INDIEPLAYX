@echo off
chcp 65001 >nul
title INDIE PLAY X - Sincronizzazione Simultanea (Hard Disk + GitHub + Cloudflare)
cd /d "%~dp0"

echo ============================================================================
echo   INDIE PLAY X - AGGIORNAMENTO SIMULTANEO HARD DISK + GITHUB + CLOUDFLARE
echo ============================================================================
echo.

set /p MSG="Inserisci una breve nota per l'aggiornamento (oppure premi INVIO per automatico): "

if "%MSG%"=="" (
    node scripts/sync-all.mjs
) else (
    node scripts/sync-all.mjs "%MSG%"
)

echo.
echo ============================================================================
echo   OPERAZIONE COMPLETATA! Hard Disk, GitHub e Hosting sono allineati.
echo ============================================================================
pause
