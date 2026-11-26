# Source this on NixOS before running Prisma, Vitest, Playwright, or a build:
#   source scripts/nix-env.sh && nix shell nixpkgs#nodejs_22 nixpkgs#openssl -c <command>
# Prisma has no prebuilt engines for NixOS, and Playwright cannot download its
# browser there (README, "NixOS"). Does nothing on other systems.
if [ -e /etc/NIXOS ] && command -v nix >/dev/null; then
  _e=$(nix build --no-link --print-out-paths nixpkgs#prisma-engines_6)
  export PRISMA_QUERY_ENGINE_LIBRARY="$_e/lib/libquery_engine.node"
  export PRISMA_SCHEMA_ENGINE_BINARY="$_e/bin/schema-engine"
  export PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE="$(nix build --no-link --print-out-paths nixpkgs#chromium)/bin/chromium"
  unset _e
fi
