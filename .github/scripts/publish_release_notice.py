"""Publish human-written improvements only after the OTA upload succeeds."""
import json
import os
import urllib.request
from pathlib import Path

notice = json.loads(Path("release-notes.json").read_text())
assert set(notice) == {"release_id", "title", "body"}
assert 0 < len(notice["title"]) <= 80 and 0 < len(notice["body"]) <= 240
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
request = urllib.request.Request(
    "https://yvoylicirtdarroqcxoq.supabase.co/rest/v1/rpc/publish_app_release",
    data=json.dumps(notice).encode(), method="POST",
    headers={"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": "application/json"},
)
with urllib.request.urlopen(request, timeout=45) as response:
    print(f"Release notice saved for {json.load(response)} accounts (0 means already announced).")
