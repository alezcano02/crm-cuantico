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
# POR QUÉ `auto` Y NO `bypassPermissions`.
#
# `auto` no pide confirmaciones —esto corre sin nadie delante— y un permiso
# denegado vuelve al modelo como error, que puede adaptarse, en vez de colgar la
# corrida esperando a alguien que no está. `bypassPermissions` sirve igual para
# eso, pero es un permiso mucho más amplio sin ganar nada aquí.
#
# LO QUE DE VERDAD FALLA ES EL CONECTOR, Y FALLA A RATOS.
#
# Ojo con la tentación de culpar al modo de permisos: se creyó que
# `bypassPermissions` era la causa porque dos corridas seguidas fallaron con él
# y la siguiente, ya con `auto`, funcionó. No era eso. Con `auto` volvió a
# fallar a la hora siguiente. El conector de Microsoft 365 aparece «Connected»
# en `claude mcp list` y aun así sus herramientas no quedan registradas en la
# sesión desatendida — a veces sí, a veces no. Ya venía descrito como «fallo
# transitorio» antes de todo esto.
#
# Por eso el remedio no es una bandera, es REINTENTAR. Es una dependencia
# remota inestable, y una segunda pasada un minuto después suele entrar. Como
# la pasada solo se registra cuando de verdad se leyó el buzón, reintentar no
# duplica nada: un intento fallido no deja rastro en la bitácora.
#
# El encargo es FIJO y vive en revisar-buzon-endosos.md. Ese archivo es la
# superficie de riesgo real — quien lo edite decide lo que hace la tarea. El
# conector de correo es de solo lectura (Mail.Read), así que por ahí no se
# puede mandar nada.
#
# --model FIJO A PROPÓSITO. La configuración global del CLI tiene el modelo
# declarado dos veces con valores distintos (claude-opus-4-7 en un sitio,
# claude-sonnet-5 en otro) — sin fijarlo aquí, cada corrida horaria podía
# terminar sola en Opus, que para clasificar un correo cuesta mucho más que
# Sonnet sin que la tarea sea más difícil. Se fija el mismo modelo que ya se
# usaba al delegar esto manualmente.
$anterior = $ErrorActionPreference
$ErrorActionPreference = "Continue"

# El límite de la tarea en Windows es de 45 minutos. Se deja de reintentar a los
# 30 para que el último intento tenga sitio de sobra para terminar y escribir su
# veredicto, en vez de que lo maten a mitad y no se sepa qué pasó.
$INTENTOS = 3
$ESPERA = 60
$TOPE = (Get-Date).AddMinutes(30)

$salida = ""
$codigo = 0
$logueado = $true

for ($intento = 1; $intento -le $INTENTOS; $intento++) {
    if ($intento -gt 1) {
        Escribir "--- Reintento $intento de $INTENTOS (el anterior no leyó el buzón) ---"
    }

    # Solo las líneas DE ESTE intento. Antes el veredicto se sacaba releyendo el
    # registro entero del día, así que un fallo de la mañana condenaba a todas
    # las pasadas siguientes aunque hubieran ido bien.
    $lineas = New-Object System.Collections.Generic.List[string]
    try {
        # La salida se va escribiendo AL VUELO en el registro. Antes se
        # acumulaba y se volcaba al final, así que una corrida matada a mitad no
        # dejaba ni una pista de por dónde iba.
        $encargo |
            & $claude -p --model claude-sonnet-5 --tools default --permission-mode auto 2>&1 |
            ForEach-Object {
                $linea = $_.ToString()
                Add-Content -Path $log -Value $linea -Encoding utf8
                $lineas.Add($linea)
            } | Out-Null
        $codigo = $LASTEXITCODE
    } catch {
        Escribir "ERROR al ejecutar el CLI: $_"
        $codigo = 1
    }

    $salida = $lineas -join "`n"

    # Sin sesión no hay reintento que valga: lo arregla una persona con /login.
    if ($salida -match "Not logged in" -or $salida -match "Please run /login") {
        $logueado = $false
        break
    }

    if ($salida -match "RESULTADO:\s*OK") { break }

    if ($intento -lt $INTENTOS -and (Get-Date) -lt $TOPE) {
        Start-Sleep -Seconds $ESPERA
    } else {
        break
    }
}

$ErrorActionPreference = $anterior

if (-not $logueado) {
    Escribir "ERROR: el CLI no está autenticado. Ejecuta 'claude' en una consola y usa /login."
    exit 1
}

# EL VEREDICTO SE PIDE POR ESCRITO, NO SE DEDUCE DE LA PROSA.
#
# Antes se buscaban dos frases concretas («no tengo ninguna herramienta de
# correo»). El 27/08 la corrida abortó por lo mismo pero redactado distinto —y
# una de las veces en inglés—, así que el filtro no coincidió y la tarea salió
# con código 0: éxito aparente, buzón sin leer. Ese es el peor fallo posible,
# porque nadie va a mirar un registro que dice que todo fue bien.
#
# Ahora el encargo obliga a cerrar con RESULTADO: OK o RESULTADO: FALLO. Se
# falla CERRADO: si el marcador no está —abortó, se colgó, se quedó sin
# contexto, la mató el límite de tiempo— es un fallo, sin importar lo bien que
# suene el texto que haya dejado.
if ($salida -notmatch "RESULTADO:\s*OK") {
    $motivo = if ($salida -match "RESULTADO:\s*FALLO\s*(.+)") {
        $Matches[1].Trim()
    } elseif ([string]::IsNullOrWhiteSpace($salida)) {
        "el CLI no devolvió nada (código $codigo)"
    } else {
        "terminó sin el marcador RESULTADO (código $codigo); mira el detalle arriba"
    }
    Escribir "ERROR: la pasada NO sirvió — $motivo"
    Escribir "=== Revisión terminada CON FALLO ==="
    exit 1
}

Escribir "=== Revisión terminada (código $codigo) ==="
