@echo off
title Pro Downloader - Pro Max Edition
cd /d "%~dp0backend"

echo ========================================================
echo              PRO DOWNLOADER - PRO MAX EDITION
echo ========================================================
echo.

:: Detect Python with priority on direct installed path
set PYTHON_CMD=
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set PYTHON_CMD="%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
) else if exist "C:\Python312\python.exe" (
    set PYTHON_CMD="C:\Python312\python.exe"
) else (
    set PYTHON_CMD=python
)

echo [1/2] Opening Browser at http://localhost:8000 ...
start "" http://localhost:8000

echo [2/2] Pro Downloader Server is starting...
echo URL: http://localhost:8000
echo (Keep this window open while using Pro Downloader)
echo ========================================================
%PYTHON_CMD% -m uvicorn app:app --host 0.0.0.0 --port 8000
pause
