#!/usr/bin/env bash
# Ybochat installer for Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/Anti-Depressants-Dev-Team/Ybochat/main/install.sh | bash
#
# Options go after `bash -s --`:
#
#   curl -fsSL https://raw.githubusercontent.com/Anti-Depressants-Dev-Team/Ybochat/main/install.sh | bash -s -- --appimage
#
# Installs the .deb on apt systems, the .rpm on dnf/yum/zypper systems and the
# AppImage everywhere else (or when there is no sudo). Every download is checked
# against the SHA-512 that the release publishes in latest-linux.yml.
#
# Everything below is wrapped in functions and only runs from the very last
# line, so a download that is cut off half way can never run a partial script.

set -euo pipefail

REPO="Anti-Depressants-Dev-Team/Ybochat"
PKG="ybochat"

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
APPIMAGE_DIR="$DATA_HOME/ybochat"
APPIMAGE_PATH="$APPIMAGE_DIR/Ybochat.AppImage"
BIN_LINK="$HOME/.local/bin/ybochat"
DESKTOP_FILE="$DATA_HOME/applications/ybochat.desktop"
ICON_FILE="$DATA_HOME/icons/hicolor/512x512/apps/ybochat.png"

METHOD=""
VERSION=""
ACTION="install"
TAG=""
PM=""
SUDO=""
WORK=""

if [ -t 1 ]; then
  BOLD=$'\033[1m'; BLUE=$'\033[34m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=""; BLUE=""; GREEN=""; YELLOW=""; RED=""; RESET=""
fi

say()  { printf '%s==>%s %s\n' "$BLUE$BOLD" "$RESET" "$*"; }
ok()   { printf '%s==>%s %s\n' "$GREEN$BOLD" "$RESET" "$*"; }
warn() { printf '%swarning:%s %s\n' "$YELLOW$BOLD" "$RESET" "$*" >&2; }
die()  { printf '%serror:%s %s\n' "$RED$BOLD" "$RESET" "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

usage() {
  cat <<EOF
Ybochat installer for Linux

Usage: install.sh [options]

  --appimage        Install the AppImage for your user only (no root needed)
  --deb             Install the .deb package
  --rpm             Install the .rpm package
  --version X.Y.Z   Install a specific release instead of the latest
  --uninstall       Remove Ybochat (your settings and logins are kept)
  -h, --help        Show this help

With no options the installer picks the best format for your system.
EOF
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --appimage) METHOD="appimage" ;;
      --deb) METHOD="deb" ;;
      --rpm) METHOD="rpm" ;;
      --version)
        [ $# -ge 2 ] || die "--version needs a value, e.g. --version 2.2.0"
        VERSION="${2#v}"
        shift
        ;;
      --version=*) VERSION="${1#*=}"; VERSION="${VERSION#v}" ;;
      --uninstall) ACTION="uninstall" ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown option: $1 (see --help)" ;;
    esac
    shift
  done
}

as_root() {
  if [ -n "$SUDO" ]; then "$SUDO" "$@"; else "$@"; fi
}

find_root() {
  if [ "$(id -u)" -eq 0 ]; then SUDO=""; return 0; fi
  if have sudo; then SUDO="sudo"; return 0; fi
  if have doas; then SUDO="doas"; return 0; fi
  return 1
}

detect_pm() {
  if have apt-get && have dpkg; then PM="apt"
  elif have dnf; then PM="dnf"
  elif have yum; then PM="yum"
  elif have zypper; then PM="zypper"
  else PM=""
  fi
}

check_platform() {
  [ "$(uname -s)" = "Linux" ] || die "this installer is for Linux. On Windows, grab the Setup .exe from https://github.com/$REPO/releases"

  case "$(uname -m)" in
    x86_64|amd64) ;;
    *) die "Ybochat only publishes x86_64 Linux builds and this machine is $(uname -m). You can build it from source: https://github.com/$REPO#development" ;;
  esac

  # Electron needs glibc; none of the published builds run on musl (e.g. Alpine).
  if ldd --version 2>&1 | grep -qi musl; then
    die "this system uses musl libc, and Ybochat's Linux builds need glibc"
  fi
}

choose_method() {
  detect_pm

  case "$METHOD" in
    deb)
      have dpkg || die "--deb needs dpkg, which this system does not have"
      find_root || die "installing the .deb needs root, but neither sudo nor doas is available"
      return
      ;;
    rpm)
      have rpm || die "--rpm needs rpm, which this system does not have"
      find_root || die "installing the .rpm needs root, but neither sudo nor doas is available"
      return
      ;;
    appimage)
      return
      ;;
  esac

  case "$PM" in
    apt) METHOD="deb" ;;
    dnf|yum|zypper) METHOD="rpm" ;;
    *) METHOD="appimage" ;;
  esac

  if [ "$METHOD" != "appimage" ] && ! find_root; then
    warn "neither sudo nor doas is available, so installing the AppImage for your user instead"
    METHOD="appimage"
  fi
}

resolve_version() {
  if [ -n "$VERSION" ]; then
    TAG="v$VERSION"
    return
  fi

  # Follow the /releases/latest redirect instead of calling the API, which
  # rate-limits anonymous requests.
  local url
  url=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest") \
    || die "could not reach GitHub to find the latest release"

  case "$url" in
    */releases/tag/v*) TAG="${url##*/tag/}" ;;
    *) die "could not work out the latest release (GitHub sent me to $url)" ;;
  esac
  VERSION="${TAG#v}"
}

asset_name() {
  case "$METHOD" in
    deb) printf '%s_%s_amd64.deb' "$PKG" "$VERSION" ;;
    rpm) printf '%s-%s.x86_64.rpm' "$PKG" "$VERSION" ;;
    appimage) printf 'Ybochat-%s.AppImage' "$VERSION" ;;
  esac
}

download() {
  local url="$1" dest="$2"
  if [ -t 2 ]; then
    curl -fL --retry 3 --retry-delay 2 --progress-bar -o "$dest" "$url"
  else
    curl -fsSL --retry 3 --retry-delay 2 -o "$dest" "$url"
  fi
}

verify() {
  local file="$1" asset="$2" meta="$WORK/latest-linux.yml" expected actual

  if ! curl -fsSL -o "$meta" "https://github.com/$REPO/releases/download/$TAG/latest-linux.yml"; then
    warn "release $TAG has no checksum file, so the download could not be verified"
    return 0
  fi

  expected=$(awk -v want="$asset" '
    /^[^ ]/ { current = "" }
    $1 == "-" && $2 == "url:" { current = $3; next }
    $1 == "sha512:" && current == want { print $2; exit }
  ' "$meta")

  if [ -z "$expected" ]; then
    warn "release $TAG lists no checksum for $asset, so the download could not be verified"
    return 0
  fi
  if ! have sha512sum; then
    warn "sha512sum is not installed, so the download could not be verified"
    return 0
  fi

  # electron-builder publishes base64; sha512sum prints hex.
  expected=$(printf '%s' "$expected" | base64 -d | od -An -v -tx1 | tr -d ' \n')
  actual=$(sha512sum "$file" | cut -d' ' -f1)

  [ "$expected" = "$actual" ] || die "checksum mismatch for $asset. The download is corrupt or has been tampered with, so nothing was installed."
  say "Checksum verified"
}

install_deb() {
  # apt fetches local files as the _apt user, which cannot read a private temp dir.
  chmod 755 "$WORK"
  chmod 644 "$1"
  if have apt-get; then
    as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y --allow-downgrades "$1"
  else
    as_root dpkg -i "$1"
  fi
}

install_rpm() {
  case "$PM" in
    dnf) as_root dnf install -y "$1" ;;
    yum) as_root yum install -y "$1" ;;
    zypper) as_root zypper --non-interactive install --allow-unsigned-rpm "$1" ;;
    *) as_root rpm -Uvh --replacepkgs "$1" ;;
  esac
}

has_fuse2() {
  local ldconfig_bin
  ldconfig_bin=$(command -v ldconfig || echo /sbin/ldconfig)
  "$ldconfig_bin" -p 2>/dev/null | grep -q 'libfuse\.so\.2'
}

install_appimage() {
  local file="$1"

  if [ "$(id -u)" -eq 0 ]; then
    warn "running as root, so the AppImage goes into root's home. Run the installer without sudo to install it for your own user."
  fi

  mkdir -p "$APPIMAGE_DIR" "$(dirname "$BIN_LINK")" "$(dirname "$DESKTOP_FILE")" "$(dirname "$ICON_FILE")"

  # Copy next to the target and rename over it, so upgrading while Ybochat is
  # running neither fails with "text file busy" nor breaks the open instance.
  cp "$file" "$APPIMAGE_PATH.new"
  chmod 755 "$APPIMAGE_PATH.new"
  mv -f "$APPIMAGE_PATH.new" "$APPIMAGE_PATH"
  # The menu entry is the main way in; a missing 'ybochat' command is not worth aborting over.
  ln -sfn "$APPIMAGE_PATH" "$BIN_LINK" || warn "could not create the 'ybochat' command at $BIN_LINK"

  if ! curl -fsSL -o "$ICON_FILE" "https://raw.githubusercontent.com/$REPO/$TAG/chat.png" \
    && ! curl -fsSL -o "$ICON_FILE" "https://raw.githubusercontent.com/$REPO/main/chat.png"; then
    warn "could not download the icon, so the menu entry will use a generic one"
  fi

  cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Ybochat
Comment=Multi-platform chat client
Exec="$APPIMAGE_PATH" %U
Icon=ybochat
Terminal=false
Categories=Network;InstantMessaging;Chat;
StartupWMClass=Ybochat
EOF

  if have update-desktop-database; then update-desktop-database -q "$(dirname "$DESKTOP_FILE")" 2>/dev/null || true; fi
  if have gtk-update-icon-cache; then gtk-update-icon-cache -q -t "$DATA_HOME/icons/hicolor" 2>/dev/null || true; fi

  if ! has_fuse2; then
    warn "AppImages need FUSE 2 (libfuse.so.2), which does not seem to be installed. Install it first:"
    printf '         Ubuntu 24.04+: sudo apt install libfuse2t64\n' >&2
    printf '         Older Ubuntu / Debian: sudo apt install libfuse2\n' >&2
    printf '         Fedora: sudo dnf install fuse-libs\n' >&2
    printf '         Arch: sudo pacman -S fuse2\n' >&2
  fi

  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) warn "$HOME/.local/bin is not on your PATH. Launch Ybochat from your app menu, or add that folder to PATH to run 'ybochat'." ;;
  esac
}

uninstall() {
  detect_pm
  local removed=0

  if have dpkg-query && dpkg-query -W -f='${Status}' "$PKG" 2>/dev/null | grep -q 'ok installed'; then
    find_root || die "removing the .deb needs root, but neither sudo nor doas is available"
    say "Removing the $PKG package"
    if have apt-get; then
      as_root env DEBIAN_FRONTEND=noninteractive apt-get remove -y "$PKG"
    else
      as_root dpkg -r "$PKG"
    fi
    removed=1
  fi

  if have rpm && rpm -q "$PKG" >/dev/null 2>&1; then
    find_root || die "removing the .rpm needs root, but neither sudo nor doas is available"
    say "Removing the $PKG package"
    case "$PM" in
      dnf) as_root dnf remove -y "$PKG" ;;
      yum) as_root yum remove -y "$PKG" ;;
      zypper) as_root zypper --non-interactive remove "$PKG" ;;
      *) as_root rpm -e "$PKG" ;;
    esac
    removed=1
  fi

  if [ -e "$APPIMAGE_PATH" ] || [ -e "$DESKTOP_FILE" ]; then
    say "Removing the AppImage"
    rm -f "$APPIMAGE_PATH" "$DESKTOP_FILE" "$ICON_FILE"
    # Only take the launcher if it is ours.
    if [ -L "$BIN_LINK" ] && [ "$(readlink "$BIN_LINK")" = "$APPIMAGE_PATH" ]; then rm -f "$BIN_LINK"; fi
    rmdir "$APPIMAGE_DIR" 2>/dev/null || true
    if have update-desktop-database; then update-desktop-database -q "$(dirname "$DESKTOP_FILE")" 2>/dev/null || true; fi
    removed=1
  fi

  if [ "$removed" -eq 0 ]; then
    say "Ybochat is not installed, nothing to remove"
    return
  fi
  ok "Ybochat has been removed"
  printf '    Your settings and logins are still in %s/Ybochat. Delete that folder to remove them too.\n' "${XDG_CONFIG_HOME:-$HOME/.config}"
}

main() {
  parse_args "$@"
  have curl || die "curl is required"

  if [ "$ACTION" = "uninstall" ]; then
    uninstall
    return
  fi

  check_platform
  choose_method
  resolve_version

  local asset
  asset=$(asset_name)

  WORK=$(mktemp -d "${TMPDIR:-/tmp}/ybochat-install.XXXXXX")
  trap 'rm -rf "$WORK"' EXIT

  say "Installing ${BOLD}Ybochat $VERSION${RESET} ($asset)"
  download "https://github.com/$REPO/releases/download/$TAG/$asset" "$WORK/$asset" \
    || die "could not download $asset from release $TAG. Check that the release exists: https://github.com/$REPO/releases"
  verify "$WORK/$asset" "$asset"

  case "$METHOD" in
    deb) install_deb "$WORK/$asset" ;;
    rpm) install_rpm "$WORK/$asset" ;;
    appimage) install_appimage "$WORK/$asset" ;;
  esac

  ok "Ybochat $VERSION is installed. Open it from your app menu or run 'ybochat'."
}

main "$@"
