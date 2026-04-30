import urllib.request
import json

token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMjUzZDNhZC1kODlmLTQ3N2UtOGJmZS0wZDYzYzdlZmQ4ZDEiLCJlbWFpbCI6InN1cGVyMkB0ZXN0LmNvbSIsInJvbGUiOiJTdXBlckFkbWluIiwiYXV0aF9wcm92aWRlciI6ImxvY2FsIiwic3RhdHVzIjoiYWN0aXZlIiwib25ib2FyZGVkIjp0cnVlLCJ0ZW5hbnRJZCI6bnVsbCwiZXhwIjoxNzc2ODk1NjUwLCJpYXQiOjE3NzY4OTQ3NTB9.Plfoac-FtLsyBs8OLQleezoObkxv7yCoD0I0b11d1Uk"


def test_endpoint(path):
    url = f"http://localhost:8001{path}"
    req = urllib.request.Request(
        url, headers={"Authorization": f"Bearer {token}"}, method="GET"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode()
            print(f"SUCCESS {path}: {body[:200]}")
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.read() else ""
        print(f"ERROR {path}: {e.code} - {body[:200]}")
    except Exception as e:
        print(f"EXCEPTION {path}: {e}")


test_endpoint("/api/v1/superadmin/dashboard/stats")
test_endpoint("/api/v1/superadmin/settings")
test_endpoint("/api/v1/superadmin/settings/health")
