# Dev shell for NixOS. Run any project command through it:
#   nix-shell --run '<command>'
# Prisma has no prebuilt engines on NixOS and Playwright cannot download its
# browser there, so both come from nixpkgs and the env vars below point at them.
{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = with pkgs; [
    nodejs_22 # engines.node is 22.x; brings npm and npx
    openssl # Prisma
    prisma-engines_6 # matches @prisma/client 6.x
    chromium # Playwright and the Playwright MCP
    postgresql # psql client (scripts/worktree-new.sh)
    git
    gh
  ];

  shellHook = ''
    export PRISMA_QUERY_ENGINE_LIBRARY="${pkgs.prisma-engines_6}/lib/libquery_engine.node"
    export PRISMA_SCHEMA_ENGINE_BINARY="${pkgs.prisma-engines_6}/bin/schema-engine"
    export PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
    export PLAYWRIGHT_CHROMIUM_EXECUTABLE="${pkgs.chromium}/bin/chromium"
    export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
    # sharp ships prebuilt libvips binaries that need libstdc++.
    export LD_LIBRARY_PATH="${pkgs.stdenv.cc.cc.lib}/lib''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  '';
}
