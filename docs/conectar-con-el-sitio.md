# Conectar el CRM con cuanticoseguros.com.co

El CRM vive en Vercel y el sitio de la agencia en **Netlify**. Para que el CRM
se vea en `cuanticoseguros.com.co/funcionarios` sin sacar al usuario del
dominio hacen falta **dos cambios**: uno ya está hecho, el otro va en el
repositorio del sitio.

---

## 1. Lado del CRM — HECHO

`next.config.mjs` cuelga toda la aplicación de `/funcionarios`:

```js
basePath: "/funcionarios"
```

Con eso, sus páginas, sus API y sus recursos quedan bajo ese prefijo, que es
justo lo que Netlify va a reenviar. Sin esto, el HTML del CRM pediría
`/cartera` y `/_next/…` contra la raíz del sitio y Netlify devolvería 404.

Ojo con una cosa que no es evidente: **`basePath` no afecta a `fetch()`**. Next
prefija los `Link`, el router, los `redirect()` y `/_next/*`, pero un
`fetch("/api/…")` lo hace el navegador y Next no lo ve. Por eso todas las
llamadas pasan por `api()` (ver `lib/rutas.ts`). Si algún día se añade un
`fetch` nuevo, tiene que usar ese ayudante.

La raíz del despliegue de Vercel redirige a `/funcionarios`, así que los
marcadores antiguos a `crm-cuantico.vercel.app` siguen funcionando.

---

## 2. Lado del sitio — PENDIENTE

Los dos cambios van en el repositorio del sitio de Netlify.

### 2.1 La reescritura

En `netlify.toml`, en la raíz del repositorio:

```toml
[[redirects]]
  from = "/funcionarios"
  to = "https://crm-cuantico.vercel.app/funcionarios"
  status = 200
  force = true

[[redirects]]
  from = "/funcionarios/*"
  to = "https://crm-cuantico.vercel.app/funcionarios/:splat"
  status = 200
  force = true
```

Si el sitio usa `_redirects` en vez de `netlify.toml`, el equivalente es:

```
/funcionarios      https://crm-cuantico.vercel.app/funcionarios      200!
/funcionarios/*    https://crm-cuantico.vercel.app/funcionarios/:splat  200!
```

Detalles que importan:

- **`status = 200`, no 301 ni 302.** Con 200 Netlify hace de proxy y la barra
  de direcciones se queda en `cuanticoseguros.com.co`. Con una redirección el
  usuario acabaría en la URL de Vercel, que es lo que se quiere evitar.
- **`force = true`** (o el `!` en `_redirects`) para que la regla gane sobre
  cualquier archivo estático que pudiera coincidir.
- Hacen falta **las dos reglas**: la primera para `/funcionarios` a secas, la
  segunda para todo lo que cuelga de ahí.
- La regla debe ir **antes** de cualquier `/*` comodín que ya exista en el
  archivo; Netlify aplica la primera que coincide.

### 2.2 El botón en el pie de página

En el pie hay este bloque:

```html
<div class="footer-links">
  <a href="/">Inicio</a>
  <a href="/nosotros">Nosotros</a>
  <a href="/servicios">Servicios</a>
  <a href="/contacto">Contacto</a>
</div>
```

Se añade una línea después de Contacto:

```html
  <a href="/funcionarios">Funcionarios</a>
```

Queda con el mismo estilo que los demás, sin tocar CSS.

---

## Cómo comprobar que quedó bien

Una vez desplegado el sitio:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://cuanticoseguros.com.co/funcionarios
```

Debe responder **200** (no 301/302). Y al abrirlo en el navegador, la barra de
direcciones tiene que seguir diciendo `cuanticoseguros.com.co/funcionarios`
después de iniciar sesión.

---

## Por qué no está hecho el paso 2

El sitio está en Netlify y su código no está en esta máquina ni en el GitHub de
la cuenta. Para aplicarlo hace falta entrar a Netlify o al repositorio del
sitio, y eso pide contraseñas: no introduzco credenciales en formularios de
acceso, ni siquiera con permiso.

Hay dos formas de destrabarlo:

1. **Compartir el repositorio del sitio** (invitación en GitHub, o una copia
   local). Con eso hago los dos cambios y los subo.
2. **Aplicarlos a mano** con lo de arriba: son una línea en el pie y un bloque
   en `netlify.toml`.
