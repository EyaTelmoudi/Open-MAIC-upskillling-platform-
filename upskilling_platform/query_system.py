import pg8000

conn = pg8000.connect(
    host="localhost",
    port=5433,
    database="upskilling_platform",
    user="upskilling",
    password="upskilling_dev_2026",
)

cursor = conn.cursor()

# Check system_config
cursor.execute("SELECT * FROM system_config")
rows = cursor.fetchall()

print("System Config:")
for row in rows:
    print(row)

# Check setup status
cursor.execute(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'system_config'"
)
columns = [r[0] for r in cursor.fetchall()]
print("\nColumns:", columns)

conn.close()
