import urllib.request
import json

token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMjUzZDNhZC1kODlmLTQ3N2UtOGJmZS0wZDYzYzdlZmQ4ZDEiLCJlbWFpbCI6InN1cGVyMkB0ZXN0LmNvbSIsInJvbGUiOiJTdXBlckFkbWluIiwiYXV0aF9wcm92aWRlciI6ImxvY2FsIiwic3RhdHVzIjoiYWN0aXZlIiwib25ib2FyZGVkIjp0cnVlLCJ0ZW5hbnRJZCI6bnVsbCwiZXhwIjoxNzc2ODk1NjUwLCJpYXQiOjE3NzY4OTQ3NTB9.Plfoac-FtLsyBs8OLQleezoObkxv7yCoD0I0b11d1Uk"

# Test decode endpoint
req = urllib.request.Request(
    "http://localhost:8000/api/v1/auth/decode",
    data=json.dumps({"token": token}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    resp = urllib.request.urlopen(req)
    print(resp.read().decode())
except Exception as e:
    print(f"Error: {e}")
