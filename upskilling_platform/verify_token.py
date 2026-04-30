import sys

sys.path.insert(0, "D:/PFE/upskilling_platform/packages/common/src")
from common.auth import decode_token
import json

token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMjUzZDNhZC1kODlmLTQ3N2UtOGJmZS0wZDYzYzdlZmQ4ZDEiLCJlbWFpbCI6InN1cGVyMkB0ZXN0LmNvbSIsInJvbGUiOiJTdXBlckFkbWluIiwiYXV0aF9wcm92aWRlciI6ImxvY2FsIiwic3RhdHVzIjoiYWN0aXZlIiwib25ib2FyZGVkIjp0cnVlLCJ0ZW5hbnRJZCI6bnVsbCwiZXhwIjoxNzc2ODk1NjUwLCJpYXQiOjE3NzY4OTQ3NTB9.Plfoac-FtLsyBs8OLQleezoObkxv7yCoD0I0b11d1Uk"
payload = decode_token(token)
if payload:
    print("Token valid:", json.dumps(payload, indent=2))
else:
    print("Token invalid")
