@echo off
chcp 65001 >nul
title Rodando o Mundo - Alimentador de Noticias Grok / X
color 0B
echo =========================================================
echo   RODANDO O MUNDO - BUSCA DE NOTICIAS NO X VIA GROK (xAI)
echo =========================================================
echo.

cd /d "%~dp0"

set "PY_CMD="
where python >nul 2>nul
if not errorlevel 1 (
    set "PY_CMD=python"
    goto :run_feeder
)

where py >nul 2>nul
if not errorlevel 1 (
    set "PY_CMD=py"
    goto :run_feeder
)

color 0C
echo [ERRO] Python nao foi encontrado no seu computador!
echo Instale o Python 3 em https://www.python.org/downloads/
pause
exit /b 1

:run_feeder
echo [1/2] Lendo chave da API no arquivo .env e conectando ao Grok (Responses API + X Search)...
%PY_CMD% scripts/grok_x_feeder.py
if errorlevel 1 goto :feeder_error

color 0A
echo.
echo =========================================================
echo  [SUCESSO] Base data/noticias_x.json atualizada com exito!
echo =========================================================
echo.
pause
exit /b 0

:feeder_error
color 0C
echo.
echo =========================================================
echo  [ATENCAO] Nao foi possivel atualizar via API.
echo  O arquivo anterior data/noticias_x.json foi preservado.
echo  Verifique se o arquivo .env possui:
echo  XAI_API_KEY=sua_chave_aqui
echo =========================================================
echo.
pause
exit /b 1
