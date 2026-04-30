#!/usr/bin/env python
import urllib.request
import json
import time
import sys

time.sleep(5)

# Login as SuperAdmin to get fresh token
login_data = json.dumps(
    {"email": "super2@test.com", "password": "TempPass123!"}
).encode()
login_req = urllib.request.Request(
    "http://localhost:8000/api/v1/auth/login/superadmin",
    data=login_data,
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(login_req) as resp:
        token = json.loads(resp.read().decode())["access_token"]
        print("Token obtained")
except Exception as e:
    print(f"Login failed: {e}", file=sys.stderr)
    sys.exit(1)

# Test settings endpoint (no trailing slash)
settings_req = urllib.request.Request(
    "http://localhost:8001/api/v1/superadmin/settings",
    headers={"Authorization": f"Bearer {token}"},
)
try:
    with urllib.request.urlopen(settings_req) as resp:
        body = resp.read().decode()
        print("Settings OK:", body[:300])
except urllib.error.HTTPError as e:
    err = e.read().decode() if e.read() else str(e)
    print(f"Settings error {e.code}: {err}", file=sys.stderr)
    sys.exit(1)
