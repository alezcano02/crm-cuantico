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
# POR QUÉ NO SE USA --allowedTools.
#
# Parecía lo correcto —permiso mínimo, solo lo que hace falta— pero se probó y
# rompe justo lo que veníamos a arreglar: con una lista blanca, las
# herramientas del conector de Microsoft 365 dejan de estar registradas en la
# sesión y ToolSearch no encuentra NINGUNA (llegan diferidas y con nombre
# dinámico, así que la lista blanca las filtra antes de que existan). El CLI
# concluye que no tiene con qué leer el correo y termina sin hacer nada.
#
# Con `bypassPermissions` sí funciona. Es un permiso amplio y conviene saberlo:
# esta tarea corre sin nadie delante, con un encargo FIJO que vive en
# revisar-buzon-endosos.md. Ese archivo es la superficie de riesgo real — quien
# lo edite decide lo que hace la tarea. El conector de correo es de solo
# lectura (Mail.Read), así que por ahí no se puede mandar nada.
$anterior = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$codigo = 0
try {
    # La salida se va escribiendo AL VUELO en el registro. Antes se acumulaba
    # y se volcaba al final, así que una corrida matada a mitad no dejaba ni
    # una pista de por dónde iba.
    $encargo |
        & $claude -p --tools default --permission-mode bypassPermissions 2>&1 |
        ForEach-Object {
            $linea = $_.ToString()
            Add-Content -Path $log -Value $linea -Encoding utf8
            $linea
        } | Out-Null
    $codigo = $LASTEXITCODE
} catch {
    Escribir "ERROR al ejecutar el CLI: $_"
    $codigo = 1
} finally {
    $ErrorActionPreference = $anterior
}

$salida = if (Test-Path $log) { Get-Content $log -Raw -Encoding utf8 } else { "" }

# Los dos fallos silenciosos que ya nos mordieron una vez cada uno.
if ($salida -match "Not logged in" -or $salida -match "Please run /login") {
    Escribir "ERROR: el CLI no está autenticado. Ejecuta 'claude' en una consola y usa /login."
    exit 1
}
if ($salida -match "no hay ninguna herramienta de correo|no tengo ninguna herramienta de correo") {
    Escribir "ERROR: el CLI no vio el conector de Microsoft 365. Comprueba con: claude mcp list"
    exit 1
}

Escribir "=== Revisión terminada (código $codigo) ==="
