#!/usr/bin/env python
import urllib.request
import json
import sys

# Login as SuperAdmin
login_data = json.dumps(
    {"email": "super2@test.com", "password": "TempPass123!"}
).encode()

try:
    req = urllib.request.Request(
        "http://localhost:8000/api/v1/auth/login/superadmin",
        data=login_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        login_resp = json.loads(resp.read().decode())
        token = login_resp.get("access_token")
        if not token:
            print("No token in response:", login_resp, file=sys.stderr)
            sys.exit(1)
        print("Got token, length:", len(token))

    # Test settings endpoint with fresh token
    settings_req = urllib.request.Request(
        "http://localhost:8001/api/v1/superadmin/settings",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(settings_req) as resp:
        data = resp.read().decode()
        print("Settings response:", data)
except urllib.error.HTTPError as e:
    err_body = e.read().decode() if e.read() else ""
    print(f"Error {e.code}: {err_body}", file=sys.stderr)
    sys.exit(1)
