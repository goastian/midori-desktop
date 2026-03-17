# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Script unificado de preparacion de paquetes de idiomas para Midori Browser.

Combina la funcionalidad de download-language-packs.sh y
copy_language_pack.py en un solo script que:

  1. Genera locales/supported-languages desde engine/browser/locales/all-locales
  2. Clona mozilla-l10n/firefox-l10n en el commit fijado (con --depth 1)
  3. Fusiona las traducciones upstream con los overrides personalizados de Midori
  4. Copia todos los paquetes de idiomas en engine/browser/locales/
  5. Limpia archivos temporales

Uso:
  python3 scripts/prepare_l10n.py                # descargar + copiar (por defecto)
  python3 scripts/prepare_l10n.py --copy-only    # solo copiar, sin descargar
  python3 scripts/prepare_l10n.py --download-only # solo descargar, sin copiar a engine/
  python3 scripts/prepare_l10n.py --force         # re-descargar aunque ya este al dia

Este script se ejecuta automaticamente con `npm run package` via package.json.
"""

import argparse
import os
import shutil
import subprocess
import sys

# ---------------------------------------------------------------------------
# Rutas (relativas a la raiz del proyecto)
# ---------------------------------------------------------------------------
LOCALES_DIR = "locales"
SUPPORTED_LANGUAGES_FILE = os.path.join(LOCALES_DIR, "supported-languages")
FIREFOX_L10N_DIR = os.path.join(LOCALES_DIR, "firefox-l10n")
L10N_COMMIT_FILE = "build/firefox-cache/l10n-last-commit-hash"
L10N_MARKER_FILE = os.path.join(LOCALES_DIR, ".l10n-commit")
BROWSER_LOCALES_DIR = "engine/browser/locales"
ALL_LOCALES_FILE = os.path.join(BROWSER_LOCALES_DIR, "all-locales")
CUSTOM_LOCALES_DIR = "src/browser/locales"

L10N_REPO = "https://github.com/mozilla-l10n/firefox-l10n"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def log(msg: str):
    print(f"[l10n] {msg}", flush=True)


def log_error(msg: str):
    print(f"[l10n] ERROR: {msg}", file=sys.stderr, flush=True)


def run(cmd: list[str], cwd: str | None = None, check: bool = True):
    """Ejecuta un comando del sistema y retorna el resultado."""
    log(f"  $ {' '.join(cmd)}")
    return subprocess.run(cmd, cwd=cwd, check=check, capture_output=False)


def get_l10n_commit() -> str:
    """Lee el hash del commit l10n fijado."""
    if not os.path.isfile(L10N_COMMIT_FILE):
        log_error(f"'{L10N_COMMIT_FILE}' no encontrado. "
                  "Ejecuta 'npm run update-ff:l10n' para generarlo.")
        sys.exit(1)

    with open(L10N_COMMIT_FILE, "r") as f:
        return f.read().strip()


def is_cache_valid(commit: str) -> bool:
    """Verifica si la cache de locales ya tiene el commit correcto.

    Ademas de verificar el marker, comprueba que al menos un locale
    tenga archivos reales (no solo directorios vacios que deja cleanup).
    """
    if not os.path.isfile(L10N_MARKER_FILE):
        return False
    with open(L10N_MARKER_FILE, "r") as f:
        cached = f.read().strip()
    if cached != commit:
        return False
    # Verificar que ademas existan archivos de idiomas (no solo el marker)
    if not os.path.isfile(SUPPORTED_LANGUAGES_FILE):
        return False
    # Verificar que al menos un locale tenga archivos reales
    # (cleanup puede haber dejado solo directorios vacios)
    langs = get_supported_languages()
    if langs:
        sample = langs[0]
        sample_dir = os.path.join(LOCALES_DIR, sample)
        if os.path.isdir(sample_dir):
            has_files = any(
                files for _, _, files in os.walk(sample_dir)
            )
            if not has_files:
                return False
    return True


def write_cache_marker(commit: str):
    """Escribe el marker de cache con el commit actual."""
    os.makedirs(LOCALES_DIR, exist_ok=True)
    with open(L10N_MARKER_FILE, "w") as f:
        f.write(commit)


# ---------------------------------------------------------------------------
# Paso 0: Generar locales/supported-languages
# ---------------------------------------------------------------------------
def generate_supported_languages():
    """
    Genera locales/supported-languages desde engine/browser/locales/all-locales.

    Si engine/ no existe (ej. en workflow de l10n sync), genera la lista
    desde los directorios disponibles en el clone de firefox-l10n.
    """
    os.makedirs(LOCALES_DIR, exist_ok=True)

    # Fuente primaria: all-locales del engine (es la fuente de verdad de Firefox)
    if os.path.isfile(ALL_LOCALES_FILE):
        log(f"Generando supported-languages desde {ALL_LOCALES_FILE}")
        with open(ALL_LOCALES_FILE, "r") as f:
            langs = [line.strip() for line in f if line.strip()]
        with open(SUPPORTED_LANGUAGES_FILE, "w") as f:
            f.write("\n".join(langs) + "\n")
        log(f"  {len(langs)} idiomas detectados desde all-locales")
        return langs

    # Fallback: generar desde los directorios del clone de firefox-l10n
    if os.path.isdir(FIREFOX_L10N_DIR):
        log(f"Generando supported-languages desde {FIREFOX_L10N_DIR}")
        entries = sorted(os.listdir(FIREFOX_L10N_DIR))
        langs = [
            e for e in entries
            if os.path.isdir(os.path.join(FIREFOX_L10N_DIR, e))
            and not e.startswith(".")
        ]
        with open(SUPPORTED_LANGUAGES_FILE, "w") as f:
            f.write("\n".join(langs) + "\n")
        log(f"  {len(langs)} idiomas detectados desde firefox-l10n")
        return langs

    # Si ya existe el archivo, usarlo
    if os.path.isfile(SUPPORTED_LANGUAGES_FILE):
        log("Usando supported-languages existente")
        return get_supported_languages()

    log_error("No se puede generar la lista de idiomas. "
              "Se necesita engine/browser/locales/all-locales "
              "o locales/firefox-l10n/.")
    sys.exit(1)


def get_supported_languages() -> list[str]:
    """Lee la lista de codigos de idiomas desde locales/supported-languages."""
    if not os.path.isfile(SUPPORTED_LANGUAGES_FILE):
        log_error(f"'{SUPPORTED_LANGUAGES_FILE}' no encontrado.")
        sys.exit(1)

    with open(SUPPORTED_LANGUAGES_FILE, "r") as f:
        # Filtrar lineas vacias para evitar pasar strings vacios a mach
        langs = [line.strip().replace("\r", "") for line in f if line.strip()]
    return langs


# ---------------------------------------------------------------------------
# Paso 1: Descargar paquetes de idiomas de mozilla-l10n
# ---------------------------------------------------------------------------
def download_l10n(force: bool = False):
    """Clona mozilla-l10n/firefox-l10n y fusiona con los directorios de locales."""
    commit = get_l10n_commit()
    log(f"Commit l10n fijado: {commit}")

    # Verificar cache — saltar si ya esta al dia
    if not force and is_cache_valid(commit):
        log("Los paquetes de idiomas ya estan descargados con el commit correcto.")
        log("Usa --force para re-descargar.")
        return

    # Si el commit cambio o no hay cache, re-descargar
    log("Descargando paquetes de idiomas...")

    # Limpiar clone anterior
    if os.path.isdir(FIREFOX_L10N_DIR):
        log("Eliminando clone anterior de firefox-l10n...")
        shutil.rmtree(FIREFOX_L10N_DIR)

    # Clonar con --depth 1 para evitar descargar el historial completo (~1 GB vs ~200 MB)
    log(f"Clonando {L10N_REPO} (shallow clone)...")
    run(["git", "clone", "--depth", "1", L10N_REPO, FIREFOX_L10N_DIR])

    # Hacer fetch del commit especifico y checkout
    log(f"Haciendo checkout del commit {commit[:12]}...")
    run(["git", "fetch", "--depth", "1", "origin", commit], cwd=FIREFOX_L10N_DIR)
    run(["git", "checkout", commit], cwd=FIREFOX_L10N_DIR)

    # Generar supported-languages si no existe
    generate_supported_languages()
    langs = get_supported_languages()

    # Determinar herramienta de copia
    use_rsync = shutil.which("rsync") is not None

    # Fusionar traducciones upstream en locales/{lang}/
    log(f"Copiando {len(langs)} idiomas a locales/...")
    for lang in langs:
        lang_src = os.path.join(FIREFOX_L10N_DIR, lang)
        lang_dst = os.path.join(LOCALES_DIR, lang)

        if not os.path.isdir(lang_src):
            continue

        os.makedirs(lang_dst, exist_ok=True)

        if use_rsync:
            run(["rsync", "-a",
                 f"{lang_src}/", f"{lang_dst}/",
                 "--exclude", ".git"], check=True)
        else:
            for item in os.listdir(lang_src):
                src_item = os.path.join(lang_src, item)
                dst_item = os.path.join(lang_dst, item)
                if os.path.isdir(src_item):
                    if os.path.exists(dst_item):
                        shutil.rmtree(dst_item)
                    shutil.copytree(src_item, dst_item)
                else:
                    shutil.copy2(src_item, dst_item)

    log(f"  {len(langs)} idiomas descargados correctamente")

    # Escribir marker de cache
    write_cache_marker(commit)
    log("Descarga completada.")


# ---------------------------------------------------------------------------
# Paso 2: Copiar paquetes de idiomas a engine/browser/locales/
# ---------------------------------------------------------------------------
def copy_files(source: str, destination: str):
    """Copia recursivamente todos los archivos de source a destination.

    Solo crea directorios de destino cuando realmente contienen archivos,
    evitando directorios vacios que rompen l10n.mk (ej. hunspell/ vacio).
    """
    if not os.path.exists(source):
        raise FileNotFoundError(f"Ruta de origen '{source}' no existe.")

    for root, dirs, files in os.walk(source):
        if not files:
            continue
        relative_path = os.path.relpath(root, source)
        destination_root = os.path.join(destination, relative_path)
        os.makedirs(destination_root, exist_ok=True)

        for file in files:
            src_file = os.path.join(root, file)
            dest_file = os.path.join(destination_root, file)
            # Saltar si ambos apuntan al mismo archivo real (symlinks de amelia)
            if os.path.exists(dest_file) and os.path.realpath(src_file) == os.path.realpath(dest_file):
                continue
            shutil.copy2(src_file, dest_file)


def copy_en_us():
    """
    Copia archivos de locale en-US a engine/browser/locales/en-US/.

    en-US es especial: los archivos base vienen del engine, y solo
    sobreponemos las cadenas personalizadas de Midori.
    """
    lang_path = os.path.join(BROWSER_LOCALES_DIR, "en-US")
    os.makedirs(lang_path, exist_ok=True)

    # Eliminar archivos src-prefixed anteriores (legacy cleanup)
    for root, _, files in os.walk(lang_path):
        for file in files:
            if file.startswith("src"):
                os.remove(os.path.join(root, file))

    # Copiar cadenas personalizadas de Midori en-US si existen
    custom_en_us = os.path.join(CUSTOM_LOCALES_DIR, "en-US")
    if os.path.isdir(custom_en_us):
        copy_files(custom_en_us, lang_path)
        log("  en-US (cadenas personalizadas de Midori)")

    # Copiar desde locales/en-US/browser/ si existe (del paso de descarga)
    locales_en_us = os.path.join(LOCALES_DIR, "en-US", "browser")
    if os.path.isdir(locales_en_us):
        copy_files(locales_en_us, lang_path)
        log("  en-US (overrides upstream)")


def copy_language(lang: str):
    """Copia un paquete de idioma individual a engine/browser/locales/{lang}/."""
    lang_path = os.path.join(BROWSER_LOCALES_DIR, lang)
    source_path = os.path.join(LOCALES_DIR, lang)

    if not os.path.isdir(source_path):
        return

    # Limpiar y recrear destino
    if os.path.exists(lang_path):
        shutil.rmtree(lang_path)

    copy_files(source_path, lang_path)


def copy_all_l10n():
    """Copia todos los paquetes de idiomas a engine/browser/locales/."""
    log("Copiando paquetes de idiomas a engine/browser/locales/ ...")

    if not os.path.isdir("engine"):
        log_error("Directorio 'engine/' no encontrado. "
                  "Ejecuta 'npm run download && npm run import' primero.")
        sys.exit(1)

    # en-US primero (manejo especial)
    copy_en_us()

    # Todos los demas idiomas
    langs = get_supported_languages()
    copied = 0
    skipped = []
    for lang in langs:
        src = os.path.join(LOCALES_DIR, lang)
        if os.path.isdir(src):
            copy_language(lang)
            copied += 1
        else:
            skipped.append(lang)

    log(f"  {copied} paquetes de idiomas copiados + en-US.")
    if skipped:
        log(f"  ⚠ {len(skipped)} idiomas sin datos locales (saltados): {', '.join(skipped[:10])}{'...' if len(skipped) > 10 else ''}")

    # Limpiar directorios spellcheck/hunspell vacios que rompen l10n.mk.
    # l10n.mk hace `test -d spellcheck` y luego `cp hunspell/*.*`, que falla
    # si hunspell/ existe pero esta vacio.
    cleaned = 0
    for lang in langs:
        hunspell_dir = os.path.join(BROWSER_LOCALES_DIR, lang, "extensions", "spellcheck", "hunspell")
        spellcheck_dir = os.path.join(BROWSER_LOCALES_DIR, lang, "extensions", "spellcheck")
        extensions_dir = os.path.join(BROWSER_LOCALES_DIR, lang, "extensions")
        # Eliminar hunspell/ si esta vacio
        if os.path.isdir(hunspell_dir) and not os.listdir(hunspell_dir):
            shutil.rmtree(hunspell_dir)
            cleaned += 1
        # Eliminar spellcheck/ si quedo vacio
        if os.path.isdir(spellcheck_dir) and not os.listdir(spellcheck_dir):
            shutil.rmtree(spellcheck_dir)
        # Eliminar extensions/ si quedo vacio
        if os.path.isdir(extensions_dir) and not os.listdir(extensions_dir):
            shutil.rmtree(extensions_dir)
    if cleaned:
        log(f"  🧹 {cleaned} directorios hunspell vacios eliminados (evita error en l10n.mk).")

    # Validar que la estructura sea correcta para mach package-multi-locale
    validate_l10n_structure(langs)


# ---------------------------------------------------------------------------
# Paso 2b: Validacion post-copia
# ---------------------------------------------------------------------------
def validate_l10n_structure(langs: list[str]):
    """Verifica que los locales copiados tengan la estructura esperada por mach."""
    errors = []
    for lang in langs:
        lang_dir = os.path.join(BROWSER_LOCALES_DIR, lang)
        if not os.path.isdir(lang_dir):
            continue
        # mach package-multi-locale espera {locale}/browser/ como minimo
        browser_subdir = os.path.join(lang_dir, "browser")
        if not os.path.isdir(browser_subdir):
            errors.append(lang)

    if errors:
        log(f"  ⚠ {len(errors)} idiomas con estructura incompleta (sin browser/): "
            f"{', '.join(errors[:10])}{'...' if len(errors) > 10 else ''}")
    else:
        log(f"  ✔ Todos los idiomas copiados tienen estructura valida.")


def print_l10n_report():
    """Imprime un reporte detallado del estado de los locales."""
    log("")
    log("=" * 60)
    log("Reporte de estado de locales")
    log("=" * 60)

    if not os.path.isfile(SUPPORTED_LANGUAGES_FILE):
        log_error("No se encontro supported-languages.")
        return

    langs = get_supported_languages()
    log(f"Idiomas soportados: {len(langs)}")

    in_locales = 0
    in_engine = 0
    valid_structure = 0

    for lang in langs:
        has_locale = os.path.isdir(os.path.join(LOCALES_DIR, lang))
        has_engine = os.path.isdir(os.path.join(BROWSER_LOCALES_DIR, lang))
        has_browser = os.path.isdir(os.path.join(BROWSER_LOCALES_DIR, lang, "browser"))

        if has_locale:
            in_locales += 1
        if has_engine:
            in_engine += 1
        if has_browser:
            valid_structure += 1

    log(f"  En locales/:                 {in_locales}/{len(langs)}")
    log(f"  En engine/browser/locales/:  {in_engine}/{len(langs)}")
    log(f"  Con estructura valida:       {valid_structure}/{len(langs)}")

    missing_in_engine = [l for l in langs
                         if not os.path.isdir(os.path.join(BROWSER_LOCALES_DIR, l))]
    if missing_in_engine:
        log(f"")
        log(f"  Faltantes en engine/: {', '.join(missing_in_engine[:20])}")

    log("=" * 60)


# ---------------------------------------------------------------------------
# Paso 3: Limpieza
# ---------------------------------------------------------------------------
def cleanup():
    """Elimina archivos temporales despues de la copia.

    Solo elimina el repo clonado de firefox-l10n (que ocupa ~200 MB).
    Los archivos extraidos en locales/{lang}/ se conservan para que
    posteriores ejecuciones (ej. npm run package) puedan re-copiarlos
    a engine/browser/locales/ sin necesidad de re-descargar.
    """
    log("Limpiando archivos temporales...")

    # Eliminar el repo clonado de firefox-l10n (ocupa mucho espacio)
    if os.path.isdir(FIREFOX_L10N_DIR):
        shutil.rmtree(FIREFOX_L10N_DIR)

    log("Limpieza completada.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Prepara paquetes de idiomas para el empaquetado de Midori Browser."
    )
    parser.add_argument(
        "--copy-only",
        action="store_true",
        help="Solo copiar archivos de locales existentes a engine/ (sin descargar)."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Forzar re-descarga aunque los paquetes ya esten al dia."
    )
    parser.add_argument(
        "--download-only",
        action="store_true",
        help="Solo descargar paquetes de idiomas, sin copiar a engine/. "
             "Util para workflows de sincronizacion l10n sin directorio engine."
    )
    parser.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Saltar limpieza (mantener archivos de locales completos)."
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Solo validar el estado actual de los locales (sin descargar ni copiar)."
    )
    args = parser.parse_args()

    log("=" * 60)
    log("Midori Browser — Preparacion de Paquetes de Idiomas")
    log("=" * 60)

    # Modo validacion: solo reportar estado
    if args.validate:
        if os.path.isfile(ALL_LOCALES_FILE):
            generate_supported_languages()
        print_l10n_report()
        return

    # Paso 0: Generar supported-languages si es posible
    if not args.copy_only:
        # Si hay engine, generar la lista antes de descargar
        if os.path.isfile(ALL_LOCALES_FILE):
            generate_supported_languages()

    # Paso 1: Descargar
    if not args.copy_only:
        download_l10n(force=args.force)

    # Asegurar que supported-languages existe despues de la descarga
    if not os.path.isfile(SUPPORTED_LANGUAGES_FILE):
        generate_supported_languages()

    # Paso 2: Copiar a engine/
    if not args.download_only:
        copy_all_l10n()

    # Paso 3: Limpiar
    if not args.no_cleanup and not args.download_only:
        cleanup()

    log("=" * 60)
    if args.download_only:
        log("Paquetes de idiomas descargados en locales/.")
    else:
        log("Paquetes de idiomas listos para empaquetado.")
    log("=" * 60)


if __name__ == "__main__":
    main()
