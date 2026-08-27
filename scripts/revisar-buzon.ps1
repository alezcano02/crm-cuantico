<#
    Revisión horaria del buzón de endosos, sin sesión interactiva.

    La lanza el Programador de tareas de Windows. Usa el CLI de Claude Code con
    la suscripción de la agencia — NO hace falta ninguna clave de API de
    Anthropic, que fue justamente el motivo de descartar la ruta de Vercel.

    POR QUÉ AQUÍ Y NO EN LA NUBE: se probó una rutina en la nube de Claude y su
    política de red bloquea la salida hacia el CRM (403 en el CONNECT del
    proxy, contra los dos dominios). Leía el correo pero no escribía nada, y
    durante un día entero reportó «éxito» sin haber guardado una sola línea,
    porque el buzón estaba vacío y nunca llegó a intentarlo. Este equipo sí
    alcanza el buzón y el CRM.

    REQUISITO, UNA SOLA VEZ: el CLI tiene que estar autenticado. Abre una
    consola, ejecuta `claude`, y dentro usa /login. Sin eso esta tarea escribe
    "Not logged in" en el registro y no hace nada.

    Deja registro en scripts/registros/ para poder mirar qué hizo cada corrida.
#>

$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $PSScriptRoot
$prompt = Join-Path $PSScriptRoot "revisar-buzon-endosos.md"
$carpetaLogs = Join-Path $PSScriptRoot "registros"
$log = Join-Path $carpetaLogs ("buzon-" + (Get-Date -Format "yyyy-MM-dd") + ".log")

if (-not (Test-Path $carpetaLogs)) {
    New-Item -ItemType Directory -Path $carpetaLogs -Force | Out-Null
}

function Escribir($texto) {
    $sello = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $log -Value "[$sello] $texto" -Encoding utf8
}

Escribir "=== Arranca la revisión del buzón ==="

$claude = Join-Path $env:APPDATA "npm\claude.cmd"
if (-not (Test-Path $claude)) {
    Escribir "ERROR: no encuentro el CLI en $claude. Instálalo con: npm install -g @anthropic-ai/claude-code"
    exit 1
}

if (-not (Test-Path $prompt)) {
    Escribir "ERROR: falta el encargo en $prompt"
    exit 1
}

Set-Location $raiz
$encargo = Get-Content $prompt -Raw -Encoding utf8

# OJO con $ErrorActionPreference aquí.
#
# En PowerShell 5.1, redirigir la salida de error de un ejecutable nativo con
# `2>&1` envuelve cada línea en un ErrorRecord (NativeCommandError). Con la
# preferencia en "Stop" eso es un error TERMINANTE aunque el programa haya
# devuelto 0 — y el script moría justo aquí, dejando el registro con la línea
# de «Arranca» y nada más. Se baja a Continue solo para esta llamada.
$anterior = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    # --permission-mode acceptEdits para que no se quede esperando una
    # confirmación que nadie va a dar: esto corre sin nadie delante.
    # --tools default para que tenga las herramientas del conector y el shell.
    $salida = ($encargo | & $claude -p --permission-mode acceptEdits --tools default 2>&1 | Out-String)
    $codigo = $LASTEXITCODE
} catch {
    $salida = "ERROR al ejecutar el CLI: $_"
    $codigo = 1
} finally {
    $ErrorActionPreference = $anterior
}

if ([string]::IsNullOrWhiteSpace($salida)) {
    Escribir "ERROR: el CLI no devolvió nada (código $codigo). Revisa que esté autenticado y que el conector de Microsoft 365 siga conectado: claude mcp list"
    exit 1
}

Escribir $salida.Trim()

# «Not logged in» es el fallo más probable y el más silencioso: sin este aviso
# la tarea parecería correr bien mientras no hace absolutamente nada.
if ($salida -match "Not logged in|Please run /login") {
    Escribir "ERROR: el CLI no está autenticado. Ejecuta `claude` en una consola y usa /login."
    exit 1
}

Escribir "=== Revisión terminada ==="
