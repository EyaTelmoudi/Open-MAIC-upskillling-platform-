import urllib.request, json

d = json.loads(
    urllib.request.urlopen("http://localhost:8001/openapi.json").read().decode()
)
print("Paths with settings:")
for path in d.get("paths", {}):
    if "settings" in path:
        print(f" {path}")
        for method, detail in d["paths"][path].items():
            print(f"   {method.upper()}: {detail.get('summary', '')}")
