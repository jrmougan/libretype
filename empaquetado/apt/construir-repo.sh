#!/usr/bin/env bash
#
# Construye el repositorio apt desde cero a partir de un montón de .deb.
#
# Se reconstruye entero cada vez, a propósito. La alternativa —ir añadiendo
# paquetes a lo que ya está publicado— es de donde salen las divergencias
# clásicas entre el índice y el pool: un `Packages` que anuncia un fichero que
# ya no está, o un .deb huérfano que nadie referencia. Si el estado se deriva
# siempre de las Releases de GitHub, no hay nada que se pueda desincronizar.
#
# Necesita Linux (o la VM de orb): `apt-ftparchive` y `dpkg-deb` no existen en
# macOS. Se prueba de punta a punta con `probar-repo.sh`.
#
#   ./construir-repo.sh --debs DIR --salida DIR [--firmar ID_DE_CLAVE]
#
set -euo pipefail

DEBS=""
SALIDA=""
FIRMAR=""

# Un solo suite en vez de uno por nombre de distribución, y no es pereza: el
# .deb depende de libwebkit2gtk-4.1-0, que está en Ubuntu 22.04 y posteriores
# y en Debian 12 y posteriores. Ese conjunto es exactamente lo que hay, así que
# partirlo en jammy/noble/bookworm/trixie sería publicar cuatro copias
# idénticas del mismo índice y dar a entender que se prueban por separado.
SUITE="stable"
COMPONENTE="main"
ARQUITECTURA="amd64"
ORIGEN="LibreType"

while [ $# -gt 0 ]; do
  case "$1" in
    --debs)    DEBS="$2"; shift 2 ;;
    --salida)  SALIDA="$2"; shift 2 ;;
    --firmar)  FIRMAR="$2"; shift 2 ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done

[ -n "$DEBS" ]   || { echo "Falta --debs" >&2; exit 2; }
[ -n "$SALIDA" ] || { echo "Falta --salida" >&2; exit 2; }
[ -d "$DEBS" ]   || { echo "No existe el directorio de .deb: $DEBS" >&2; exit 2; }

for cmd in apt-ftparchive dpkg-deb; do
  command -v "$cmd" >/dev/null || {
    echo "Falta $cmd. En Debian/Ubuntu: apt-get install apt-utils dpkg-dev" >&2
    exit 2
  }
done

mapfile -t ENCONTRADOS < <(find "$DEBS" -maxdepth 2 -name '*.deb' -type f | sort)
if [ "${#ENCONTRADOS[@]}" -eq 0 ]; then
  # Sin paquetes saldría un repositorio sintácticamente válido y vacío, que es
  # peor que ninguno: apt diría «no candidate» sin explicar por qué.
  echo "No hay ningún .deb en $DEBS. Nada que publicar." >&2
  exit 1
fi

# Desde cero. Si quedara un Packages o un InRelease de una pasada anterior,
# `apt-ftparchive release` lo metería en su propia lista de hashes.
rm -rf "$SALIDA"
DEST="$SALIDA/dists/$SUITE/$COMPONENTE/binary-$ARQUITECTURA"
mkdir -p "$DEST"

echo "==> Colocando ${#ENCONTRADOS[@]} paquete(s) en el pool"
for deb in "${ENCONTRADOS[@]}"; do
  # El nombre del paquete se lee del .deb y no se escribe a mano. Tauri lo
  # deriva del productName partiendo el CamelCase, así que «LibreType» sale
  # como «libre-type»; suponerlo es cómo se acaba publicando un pool con la
  # ruta equivocada.
  paquete=$(dpkg-deb -f "$deb" Package)
  version=$(dpkg-deb -f "$deb" Version)
  arq=$(dpkg-deb -f "$deb" Architecture)
  if [ "$arq" != "$ARQUITECTURA" ]; then
    echo "    saltando $(basename "$deb"): arquitectura $arq" >&2
    continue
  fi
  destino="$SALIDA/pool/$COMPONENTE/${paquete:0:1}/$paquete"
  mkdir -p "$destino"
  # Nombre canónico, no el del fichero de la Release: dos releases podrían
  # traer el mismo .deb con nombres distintos y saldría duplicado en el índice.
  cp -f "$deb" "$destino/${paquete}_${version}_${arq}.deb"
  echo "    $paquete $version"
done

cd "$SALIDA"

echo "==> Índice de paquetes"
# Desde la raíz del repositorio para que el campo Filename salga relativo a
# ella, que es como apt lo va a resolver.
apt-ftparchive packages pool > "dists/$SUITE/$COMPONENTE/binary-$ARQUITECTURA/Packages"
gzip -9cn "dists/$SUITE/$COMPONENTE/binary-$ARQUITECTURA/Packages" \
  > "dists/$SUITE/$COMPONENTE/binary-$ARQUITECTURA/Packages.gz"

echo "==> Fichero Release"
apt-ftparchive \
  -o "APT::FTPArchive::Release::Origin=$ORIGEN" \
  -o "APT::FTPArchive::Release::Label=$ORIGEN" \
  -o "APT::FTPArchive::Release::Suite=$SUITE" \
  -o "APT::FTPArchive::Release::Codename=$SUITE" \
  -o "APT::FTPArchive::Release::Architectures=$ARQUITECTURA" \
  -o "APT::FTPArchive::Release::Components=$COMPONENTE" \
  -o "APT::FTPArchive::Release::Description=Tutor de mecanografia LibreType" \
  release "dists/$SUITE" > "dists/$SUITE/Release"

if [ -n "$FIRMAR" ]; then
  echo "==> Firmando con $FIRMAR"
  # En CI no hay nadie para teclear la contraseña de la clave, y sin
  # `loopback` gpg intenta abrir un pinentry y se queda colgado hasta que el
  # job expira. Con la clave sin contraseña esto no hace falta.
  PASE=()
  if [ -n "${GPG_PASSPHRASE:-}" ]; then
    PASE=(--pinentry-mode loopback --passphrase "$GPG_PASSPHRASE")
  fi
  # InRelease (firma incrustada) es lo que usa apt desde hace años; Release.gpg
  # (firma aparte) se deja por compatibilidad con clientes viejos.
  gpg --batch --yes "${PASE[@]}" --local-user "$FIRMAR" \
      --clearsign -o "dists/$SUITE/InRelease" "dists/$SUITE/Release"
  gpg --batch --yes "${PASE[@]}" --local-user "$FIRMAR" \
      -abs -o "dists/$SUITE/Release.gpg" "dists/$SUITE/Release"
else
  # Sin firma apt exige [trusted=yes] en cada máquina, que es justo lo que no
  # se le quiere pedir a nadie. Se avisa fuerte porque publicar así sin darse
  # cuenta es un error que solo se ve cuando alguien intenta instalar.
  echo "AVISO: repositorio SIN FIRMAR. Solo vale para pruebas locales." >&2
fi

echo "==> Listo en $SALIDA"
find . -type f | sort | sed 's/^/    /'
