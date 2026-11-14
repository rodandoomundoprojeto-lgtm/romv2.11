@echo off
title Servidor FastAPI - Rodando o Mundo (Motor V2)
cd /d "%~dp0"
echo ========================================================
echo   Iniciando Servidor FastAPI (Motor V2 e Painel Admin)
echo   Porta: 8000
echo   URL: http://127.0.0.1:8000
echo ========================================================
echo.
call .venv\Scripts\activate.bat
python -m uvicorn main:app --reload --port 8000
pause
