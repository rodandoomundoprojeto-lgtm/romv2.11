$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
Set-Location $root

$failures = @()
Write-Host "=== [QA & Integrator] Iniciando Auditoria Cruzada do Projeto ROM ===" -ForegroundColor Cyan

# 1. Validar sintaxe JavaScript (Frontend + Backend Functions + Workers)
Write-Host "`n[1/5] Validando sintaxe JavaScript (node -c)..." -ForegroundColor Yellow
$jsFiles = @("app.js", "noticias.js")
if (Test-Path "functions") {
    $jsFiles += Get-ChildItem -Path "functions" -Recurse -Filter "*.js" | ForEach-Object { $_.FullName }
}
if (Test-Path "workers") {
    $jsFiles += Get-ChildItem -Path "workers" -Recurse -Filter "*.js" | Where-Object { $_.FullName -notmatch "node_modules|\.wrangler" } | ForEach-Object { $_.FullName }
}

foreach ($f in $jsFiles) {
    if (Test-Path $f) {
        $output = & node -c $f 2>&1
        if ($LASTEXITCODE -ne 0) {
            $failures += "Erro de sintaxe JS em ${f}: $output"
            Write-Host "  [FAIL] $f" -ForegroundColor Red
        } else {
            Write-Host "  [OK]   $f" -ForegroundColor Green
        }
    }
}

# 2. Validar sintaxe Python (Backend Collectors)
Write-Host "`n[2/5] Validando sintaxe Python (py_compile)..." -ForegroundColor Yellow
$pyFiles = @("main.py")
if (Test-Path "src") {
    $pyFiles += Get-ChildItem -Path "src" -Filter "*.py" | ForEach-Object { $_.FullName }
}
foreach ($pf in $pyFiles) {
    if (Test-Path $pf) {
        $pyOut = & python -m py_compile $pf 2>&1
        if ($LASTEXITCODE -ne 0) {
            $failures += "Erro de sintaxe Python em ${pf}: $pyOut"
            Write-Host "  [FAIL] $pf" -ForegroundColor Red
        } else {
            Write-Host "  [OK]   $pf" -ForegroundColor Green
        }
    }
}

# 3. Verificar paridade SPA entre index.html e 200.html
Write-Host "`n[3/5] Verificando paridade estrutural index.html <-> 200.html..." -ForegroundColor Yellow
if ((Test-Path "index.html") -and (Test-Path "200.html")) {
    $hashIndex = (Get-FileHash "index.html" -Algorithm SHA256).Hash
    $hash200   = (Get-FileHash "200.html" -Algorithm SHA256).Hash
    if ($hashIndex -ne $hash200) {
        $failures += "Divergencia detectada entre index.html e 200.html (Hashes diferentes)."
        Write-Host "  [FAIL] index.html e 200.html estao diferentes!" -ForegroundColor Red
    } else {
        Write-Host "  [OK]   index.html e 200.html estao 100% sincronizados." -ForegroundColor Green
    }
}

# 4. Verificar Controle de Versão pelo nome da pasta raiz (Regra 5 GEMINI.md)
Write-Host "`n[4/5] Verificando Controle de Versao pela pasta raiz..." -ForegroundColor Yellow
$folderName = Split-Path -Leaf $root
if ($folderName -match "V(\d+\.\d+)") {
    $expectedVersion = "v" + $Matches[1]
    Write-Host "  Versao esperada pela pasta ('$folderName'): $expectedVersion"
    $indexContent = Get-Content "index.html" -Raw -Encoding UTF8
    if ($indexContent -notmatch [regex]::Escape($expectedVersion)) {
        $failures += "index.html nao contem a versao esperada ($expectedVersion) no rodape."
        Write-Host "  [FAIL] index.html sem $expectedVersion" -ForegroundColor Red
    } else {
        Write-Host "  [OK]   index.html contem $expectedVersion" -ForegroundColor Green
    }
    if (Test-Path "sobre.html") {
        $sobreContent = Get-Content "sobre.html" -Raw -Encoding UTF8
        if ($sobreContent -notmatch [regex]::Escape($expectedVersion)) {
            $failures += "sobre.html nao contem a versao esperada ($expectedVersion)."
            Write-Host "  [FAIL] sobre.html sem $expectedVersion" -ForegroundColor Red
        } else {
            Write-Host "  [OK]   sobre.html contem $expectedVersion" -ForegroundColor Green
        }
    }
}

# 5. Verificar ausência de backups soltos fora de _backups/ (Regra 6 GEMINI.md)
Write-Host "`n[5/5] Verificando backups soltos fora de _backups/..." -ForegroundColor Yellow
$looseBackups = Get-ChildItem -Path $root -Filter "*backup*" -Force | Where-Object { $_.Name -ne "_backups" }
if ($looseBackups) {
    foreach ($lb in $looseBackups) {
        $failures += "Backup solto na raiz proibido pela Regra 6: $($lb.Name)"
        Write-Host "  [FAIL] Backup solto encontrado: $($lb.Name)" -ForegroundColor Red
    }
} else {
    Write-Host "  [OK]   Nenhum backup solto na raiz." -ForegroundColor Green
}

Write-Host "`n==================================================================" -ForegroundColor Cyan
if ($failures.Count -gt 0) {
    Write-Host "RESULTADO FINAL: FAIL ($($failures.Count) problema(s) encontrado(s))" -ForegroundColor Red
    foreach ($fail in $failures) {
        Write-Host " - $fail" -ForegroundColor Red
    }
    exit 1
} else {
    Write-Host "RESULTADO FINAL: PASS (Todos os checks de sintaxe e regras aprovados)" -ForegroundColor Green
    exit 0
}
