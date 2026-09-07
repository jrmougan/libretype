#!/usr/bin/env bash
#
# Prueba de punta a punta del repositorio apt, con un apt de verdad.
#
# Comprueba las cuatro cosas que pueden romperse y que no se ven leyendo el
# script que genera el repositorio:
#
#   1. apt acepta el índice y la firma sin pedir [trusted=yes].
#   2. `apt-get install` encuentra e instala el paquete.
#   3. Publicar una versión nueva hace que `apt-get upgrade` la coja.
#   4. Tocar el índice después de firmarlo hace que apt lo rechace. Sin esto,
#      un repositorio con la firma puesta de adorno pasaría los tres primeros.
#
# Los .deb son sintéticos: lo que se prueba es la maquinaria del repositorio,
# no la compilación de la app. Construir LibreType aquí metería el toolchain de
# Rust y pnpm en un test que tiene que ser barato para poder correr siempre.
#
# Necesita Linux y root. Desde macOS:
#
#   orb -m spike bash empaquetado/apt/probar-repo.sh
#
# En CI lo lanza el job `repo-apt` de ci.yml.
#
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
PAQUETE="libre-type"
PUERTO="${PUERTO:-8099}"

SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

fallo() { echo "FALLO: $*" >&2; exit 1; }

for cmd in apt-ftparchive dpkg-deb gpg python3 apt-get; do
  command -v "$cmd" >/dev/null || fallo "falta $cmd (apt-get install apt-utils dpkg-dev gnupg python3)"
done

TMP="$(mktemp -d)"
SERVIDOR_PID=""
limpiar() {
  [ -n "$SERVIDOR_PID" ] && kill "$SERVIDOR_PID" 2>/dev/null || true
  $SUDO rm -f /etc/apt/sources.list.d/libretype-prueba.list
  $SUDO rm -f /usr/share/keyrings/libretype-prueba.gpg
  rm -rf "$TMP"
}
trap limpiar EXIT

# --- Un .deb sintético por versión ----------------------------------------
mkdir -p "$TMP/debs"
hacer_deb() {
  local version="$1"
  local raiz="$TMP/build-$version"
  mkdir -p "$raiz/DEBIAN" "$raiz/usr/bin"
  printf '#!/bin/sh\necho libretype %s\n' "$version" > "$raiz/usr/bin/$PAQUETE"
  chmod 755 "$raiz/usr/bin/$PAQUETE"
  cat > "$raiz/DEBIAN/control" <<EOF
Package: $PAQUETE
Version: $version
Architecture: amd64
Maintainer: Prueba <prueba@example.invalid>
Priority: optional
Section: education
Description: Paquete de prueba del repositorio apt de LibreType
 No es la aplicación: solo sirve para comprobar el repositorio.
EOF
  dpkg-deb --build --root-owner-group -Znone "$raiz" \
    "$TMP/debs/${PAQUETE}_${version}_amd64.deb" >/dev/null
}

echo "==> Construyendo .deb de prueba"
hacer_deb 0.1.0
hacer_deb 0.2.0

# --- Clave de firma de usar y tirar ---------------------------------------
export GNUPGHOME="$TMP/gnupg"
mkdir -p "$GNUPGHOME"
chmod 700 "$GNUPGHOME"
echo "==> Clave de firma temporal"
gpg --batch --quiet --passphrase '' --quick-generate-key \
    'Prueba LibreType <prueba@example.invalid>' default default never
CLAVE=$(gpg --list-keys --with-colons | awk -F: '/^fpr:/ {print $10; exit}')

# --- Solo la 0.1.0 publicada ----------------------------------------------
echo "==> Repositorio con la 0.1.0"
mkdir -p "$TMP/solo-vieja"
cp "$TMP/debs/${PAQUETE}_0.1.0_amd64.deb" "$TMP/solo-vieja/"
bash "$AQUI/construir-repo.sh" \
  --debs "$TMP/solo-vieja" --salida "$TMP/repo" --firmar "$CLAVE" >/dev/null

gpg --export "$CLAVE" > "$TMP/llavero.gpg"
$SUDO cp "$TMP/llavero.gpg" /usr/share/keyrings/libretype-prueba.gpg
echo "deb [signed-by=/usr/share/keyrings/libretype-prueba.gpg] http://127.0.0.1:$PUERTO stable main" \
  | $SUDO tee /etc/apt/sources.list.d/libretype-prueba.list >/dev/null

python3 -m http.server "$PUERTO" --directory "$TMP/repo" >/dev/null 2>&1 &
SERVIDOR_PID=$!
for _ in $(seq 1 50); do
  curl -sf "http://127.0.0.1:$PUERTO/dists/stable/InRelease" >/dev/null && break
  sleep 0.2
done
curl -sf "http://127.0.0.1:$PUERTO/dists/stable/InRelease" >/dev/null \
  || fallo "el servidor de prueba no responde"

# --- 1 y 2: apt se lo cree y lo instala -----------------------------------
echo "==> apt-get update (firma)"
# Solo esta fuente: en un contenedor recién hecho las de la distro pueden estar
# caídas o vacías, y este test no va de eso.
SOLO_NUESTRA=(-o Dir::Etc::sourcelist=/etc/apt/sources.list.d/libretype-prueba.list
              -o Dir::Etc::sourceparts=/dev/null
              -o APT::Get::List-Cleanup=0)
salida=$($SUDO apt-get "${SOLO_NUESTRA[@]}" update 2>&1) || {
  echo "$salida" >&2; fallo "apt-get update rechazó el repositorio"
}
echo "$salida" | grep -qiE 'NO_PUBKEY|not signed|no está firmado' \
  && fallo "apt no confía en la firma: $salida"

echo "==> apt-get install"
$SUDO apt-get "${SOLO_NUESTRA[@]}" install -y --allow-unauthenticated=false "$PAQUETE" >/dev/null \
  || fallo "no se pudo instalar $PAQUETE desde el repositorio"
instalada=$(dpkg-query -W -f='${Version}' "$PAQUETE")
[ "$instalada" = "0.1.0" ] || fallo "se instaló $instalada en vez de 0.1.0"
echo "    instalada la $instalada"

# --- 3: publicar la 0.2.0 y actualizar ------------------------------------
echo "==> Repositorio con las dos versiones, y apt-get upgrade"
bash "$AQUI/construir-repo.sh" \
  --debs "$TMP/debs" --salida "$TMP/repo" --firmar "$CLAVE" >/dev/null
$SUDO apt-get "${SOLO_NUESTRA[@]}" update >/dev/null 2>&1 \
  || fallo "apt-get update falló tras republicar"
$SUDO apt-get "${SOLO_NUESTRA[@]}" upgrade -y >/dev/null \
  || fallo "apt-get upgrade falló"
instalada=$(dpkg-query -W -f='${Version}' "$PAQUETE")
[ "$instalada" = "0.2.0" ] \
  || fallo "apt-get upgrade dejó la $instalada; la actualización automática no funciona"
echo "    actualizada a la $instalada"

# --- 4: la firma y los hashes tienen que servir de algo --------------------
#
# Con las listas ya descargadas apt no vuelve a pedir el índice si el
# InRelease no ha cambiado, así que manipularlo sin más pasaría el test sin
# que apt llegase a mirarlo. Hay que vaciar la caché para forzar la descarga:
# es la diferencia entre comprobar la cadena de confianza y comprobar que apt
# tiene memoria.
vaciar_listas() { $SUDO rm -rf /var/lib/apt/lists/*; }

# Un `sed` que no encaja no cambia nada y el test pasaría en verde sin haber
# manipulado un solo byte. Se comprueba que el fichero cambió de verdad antes
# de preguntarle a apt.
manipular() {
  local fichero="$1" antes
  antes=$(sha256sum "$fichero" | cut -d' ' -f1)
  shift
  "$@"
  [ "$(sha256sum "$fichero" | cut -d' ' -f1)" != "$antes" ] \
    || fallo "la manipulación de $(basename "$fichero") no cambió nada; el test no probaría nada"
}

echo "==> Manipulando el índice ya firmado"
# Las dos variantes: apt prefiere Packages.gz y tocar solo la otra no probaría
# nada. Ambas están cubiertas por los hashes del Release, que va firmado.
PKG="$TMP/repo/dists/stable/main/binary-amd64/Packages"
manipular "$PKG" sed -i 's/^Version: .*/Version: 9.9.9/' "$PKG"
gzip -9cn "$PKG" > "$TMP/repo/dists/stable/main/binary-amd64/Packages.gz"
vaciar_listas
if $SUDO apt-get "${SOLO_NUESTRA[@]}" update >/dev/null 2>&1; then
  fallo "apt aceptó un índice manipulado: los hashes del Release no protegen nada"
fi
echo "    apt lo rechaza por el hash, como debe"

echo "==> Manipulando la propia firma"
# Y esto es lo que comprueba que signed-by hace algo: si se acepta un
# InRelease alterado, cualquiera que sirva este dominio puede publicar lo que
# quiera y el llavero es decorativo.
INREL="$TMP/repo/dists/stable/InRelease"
manipular "$INREL" sed -i 's/^Origin: .*/Origin: OtroCualquiera/' "$INREL"
vaciar_listas
salida=$($SUDO apt-get "${SOLO_NUESTRA[@]}" update 2>&1) && \
  fallo "apt aceptó un InRelease con la firma rota"
echo "$salida" | grep -qiE 'BADSIG|invalid|no válid|not valid|verif' \
  || fallo "apt falló, pero no por la firma: $salida"
echo "    apt lo rechaza por la firma, como debe"

echo
echo "OK: el repositorio se firma, se instala, se actualiza y detecta manipulaciones."
