#!/usr/bin/env python3
"""Email the owner when an unattended renewal fails, with links to fix it.

  python3 alert-email.py nyt [--test]

Sends over Gmail SMTP with the App Password the interview-sheet skill already
keeps (~/.config/interview-sheet-skill/gmail_app_password, or env
GMAIL_APP_PASSWORD) — the secret is read in place, never copied here. From and
To are the owner's own address, so it is not a spoof. The failure reason is
the last "[<pub>] FAILED" line of the latest run in logs/local-renew.log.
Exit 0 only when Gmail accepted the message.
"""
import html
import os
import smtplib
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate

HERE = os.path.dirname(os.path.abspath(__file__))
TO = os.environ.get("NEWSSTAND_ALERT_TO", "varunb007@gmail.com")
PW_FILE = os.path.expanduser("~/.config/interview-sheet-skill/gmail_app_password")
APP_URL = "https://varunb.me/newsstand/"

PUBS = {
    "nyt": {
        "name": "New York Times",
        "renew_url": APP_URL,
        "login_url": "https://myaccount.nytimes.com/auth/login?redirect_uri=https%3A%2F%2Fwww.nytimes.com%2Faccount",
        "reseed": "reseed-nyt.command",
    },
}


def app_password():
    v = os.environ.get("GMAIL_APP_PASSWORD", "").strip()
    if not v and os.path.exists(PW_FILE):
        v = open(PW_FILE).read().strip()
    if not v:
        sys.exit(f"no Gmail App Password in {PW_FILE} or GMAIL_APP_PASSWORD")
    return v.replace(" ", "")


def failure_reason(pub_id):
    log = os.path.join(HERE, "logs", "local-renew.log")
    try:
        lines = open(log, errors="replace").read().splitlines()
    except OSError:
        return "unknown (log unreadable)"
    start = max((i for i, l in enumerate(lines) if "local renew start" in l), default=0)
    hits = [l for l in lines[start:] if l.startswith(f"[{pub_id}] FAILED")]
    return hits[-1].split("FAILED", 1)[1].lstrip(" —-") if hits else "unknown (no FAILED line in the latest run)"


def main():
    args = sys.argv[1:]
    test = "--test" in args
    pub_id = next((a for a in args if not a.startswith("--")), "nyt")
    pub = PUBS[pub_id]
    reason = failure_reason(pub_id)
    reseed_path = os.path.join(HERE, pub["reseed"])
    name = pub["name"]

    subject = f"{'[test] ' if test else ''}Newsstand: {name} renewal failed — tap to renew"
    text = f"""The automatic {name} renewal failed this morning, so the pass may lapse.

Why: {reason}

1. Renew now (phone is fine): {pub['renew_url']}
   Tap {name} in Newsstand.

2. Check you're signed in to {name}: {pub['login_url']}

3. Fix the automation (at the Mac): double-click
   {reseed_path}
   Log in to {name} in the Chrome window it opens, then quit that Chrome (Cmd-Q).
   Tomorrow's 8:00 run will renew again; the "Confirming your New York Times access" email confirms it.
"""
    e = html.escape
    btn = "display:inline-block;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600"
    body = f"""<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#202124;max-width:560px">
<p>The automatic <b>{e(name)}</b> renewal failed this morning, so the pass may lapse.</p>
<p style="color:#5f6368;font-size:13px">Why: {e(reason)}</p>
<p><a href="{e(pub['renew_url'])}" style="{btn};background:#111;color:#fff">Renew now in Newsstand</a></p>
<p><a href="{e(pub['login_url'])}" style="{btn};background:#fff;color:#111;border:1px solid #ccc">Sign in to {e(name)}</a></p>
<p style="margin-top:24px"><b>Fix the automation (at the Mac):</b> double-click<br>
<code style="font-size:12px">{e(reseed_path)}</code><br>
Log in to {e(name)} in the Chrome window it opens, then quit that Chrome (Cmd-Q).
Tomorrow's 8:00 run will renew again.</p>
</div>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"], msg["From"], msg["To"] = subject, TO, TO
    msg["Date"] = formatdate(localtime=True)
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(body, "html", "utf-8"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as s:
        s.login(TO, app_password())
        s.sendmail(TO, [TO], msg.as_string())
    print(f"alert email sent to owner ({pub_id})")


if __name__ == "__main__":
    main()
