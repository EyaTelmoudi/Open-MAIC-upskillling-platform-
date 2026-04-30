import pg8000

conn = pg8000.connect(
    host="localhost",
    port=5433,
    database="upskilling_platform",
    user="upskilling",
    password="upskilling_dev_2026",
)

cursor = conn.cursor()
cursor.execute(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position"
)
columns = [r[0] for r in cursor.fetchall()]
print("Columns:", columns)

cursor.execute("SELECT * FROM users LIMIT 20")
rows = cursor.fetchall()

print("\nUsers:")
for row in rows:
    print(row)

conn.close()
