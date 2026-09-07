#!/bin/zsh
cd -- "${0:A:h}" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
  print 'Welcome to War Room! First install Node.js LTS (22 or newer) from the page opening now.'
  print 'After installing, double-click Start War Room.command again.'
  open 'https://nodejs.org/en/download'
  read '?Press Return to close this window.'
  exit 1
fi
node scripts/start-war-room.mjs
if [[ $? -ne 0 ]]; then
  read '?Press Return to close this window.'
fi
