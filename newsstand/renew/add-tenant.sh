#!/bin/zsh
# One-command household-member setup for zero-touch NYT renewals.
#
#   ./add-tenant.sh <name>        e.g. ./add-tenant.sh maya
#
# Prompts for their library card + PIN, opens a bare Chrome window for them
# to log into THEIR NYT account (the window blocks the script — quit Chrome
# to continue), verifies the session actually saved, then runs their first
# renewal on the spot. After this, the daily 8 AM agent renews them forever.
set -uo pipefail
cd "${0:A:h}"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
name="${1:-}"
if [[ ! "$name" =~ '^[a-z][a-z0-9-]*$' ]]; then
  echo "usage: ./add-tenant.sh <name>   (lowercase letters, digits, dashes)"
  exit 1
fi
[[ -x "$CHROME" ]] || { echo "Google Chrome not found at $CHROME"; exit 1; }

if [[ -f "tenants/$name.env" ]]; then
  echo "tenants/$name.env already exists — re-running will re-seed the NYT session only."
else
  echo "Enter $name's SCCLD library card number (dashes OK):"
  read -r card
  echo "Enter $name's library PIN:"
  read -rs pin
  echo
  [[ -n "$card" && -n "$pin" ]] || { echo "card and PIN are both required"; exit 1; }
  mkdir -p tenants
  printf 'SCCLD_CARD=%s\nSCCLD_PIN=%s\n' "${card//-/}" "$pin" > "tenants/$name.env"
  chmod 600 "tenants/$name.env"
  echo "saved tenants/$name.env (gitignored, this machine only)"
fi

echo
echo ">>> A Chrome window will open at nytimes.com/account."
echo ">>> Have $name log into THEIR OWN NYT account (free — create one there if needed)."
echo ">>> When they see their account page, QUIT that Chrome (Cmd-Q) to continue."
echo
"$CHROME" --user-data-dir="$PWD/state/profile-$name" --no-first-run \
  "https://www.nytimes.com/account" >/dev/null 2>&1

# The login session cookie is the whole point — verify it actually landed.
if ! sqlite3 "file:state/profile-$name/Default/Cookies?mode=ro" \
    "select count(*) from cookies where host_key='.nytimes.com' and name='NYT-S'" 2>/dev/null | grep -q '^[1-9]'; then
  echo "✗ No NYT login found in the profile — the sign-in didn't finish. Run this script again."
  exit 1
fi
echo "✓ NYT session saved for $name"

echo "Running $name's first renewal now..."
if ( set -a; source "tenants/$name.env"; set +a
     node renew.mjs --pubs nyt --headless --profile "state/profile-$name" --shots "shots/$name" ); then
  echo "✓ Done — $name should have a 'Confirming your New York Times access' email within a minute,"
  echo "  and the NYT app on their phone (logged into that same account) now just works."
  echo "  Renewals repeat daily at 8 AM automatically. Nothing else to do."
else
  echo "✗ First renewal failed — check the output above. If it stalled at an auth page, run this script again to re-seed."
  exit 1
fi
