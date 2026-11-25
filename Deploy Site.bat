@echo off
cd /d "%~dp0"

where pythonw >nul 2>nul
if not errorlevel 1 (
    start "" pythonw "%~dp0scripts\deploy_app.py"
    exit /b 0
)

where pyw >nul 2>nul
if not errorlevel 1 (
    start "" pyw "%~dp0scripts\deploy_app.py"
    exit /b 0
)

where python >nul 2>nul
if not errorlevel 1 (
    start "" python "%~dp0scripts\deploy_app.py"
    exit /b 0
)

echo [ERRO] Python nao encontrado neste computador.
echo Instale o Python 3 em https://www.python.org/downloads/
pause
exit /b 1
