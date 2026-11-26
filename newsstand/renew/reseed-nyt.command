#!/bin/zsh
# Double-click in Finder to re-seed the NYT login the daily renewal reuses.
# Opens real Chrome (not Playwright: DataDome blanks the login for automation)
# on the renewal profile. Log in to NYT there, then quit that Chrome (Cmd-Q).
cd "${0:A:h}"
if pgrep -f -- "--user-data-dir=$PWD/state/profile( |$)" >/dev/null; then
  echo "The renewal profile is in use (a run may be going, or Chrome is already open on it). Try again in a minute."
  read -k1 "?Press any key to close."
  exit 1
fi
echo "Log in to NYT in the Chrome window that opens, then quit it with Cmd-Q."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$PWD/state/profile" --no-first-run \
  "https://myaccount.nytimes.com/auth/login?redirect_uri=https%3A%2F%2Fwww.nytimes.com%2Faccount"
echo "Chrome closed. Checking for the NYT session..."
cp state/profile/Default/Cookies state/.cookies-check.db 2>/dev/null
if sqlite3 state/.cookies-check.db "select 1 from cookies where host_key like '%nytimes.com' and name='NYT-S' limit 1" 2>/dev/null | grep -q 1; then
  echo "NYT session saved. Tomorrow's 8:00 run will renew."
else
  echo "No NYT session found — the login didn't stick. Run this again."
fi
rm -f state/.cookies-check.db
read -k1 "?Press any key to close."
