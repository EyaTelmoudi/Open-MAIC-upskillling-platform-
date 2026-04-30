import urllib.request, json

d = json.loads(
    urllib.request.urlopen("http://localhost:8001/openapi.json").read().decode()
)
# Find all paths with 'settings'
for path, methods in d.get("paths", {}).items():
    if "settings" in path:
        print(f"Path: {path}")
        for method, details in methods.items():
            print(f"  {method.upper()}: {details.get('summary', 'no summary')}")
