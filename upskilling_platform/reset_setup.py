import pg8000

conn = pg8000.connect(
    host="localhost",
    port=5433,
    database="upskilling_platform",
    user="upskilling",
    password="upskilling_dev_2026",
)

cursor = conn.cursor()

# Reset setup_completed to false
cursor.execute("UPDATE system_config SET setup_completed = false WHERE id = 1")
conn.commit()

print("Setup reset to incomplete!")

# Verify
cursor.execute("SELECT setup_completed FROM system_config WHERE id = 1")
result = cursor.fetchone()
print(f"setup_completed is now: {result[0]}")

conn.close()
