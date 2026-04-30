import pg8000

conn = pg8000.connect(
    host="localhost",
    port=5433,
    database="upskilling_platform",
    user="upskilling",
    password="upskilling_dev_2026",
)

cursor = conn.cursor()

# Delete all users
cursor.execute("DELETE FROM users")
conn.commit()

print("All users deleted!")

# Verify
cursor.execute("SELECT COUNT(*) FROM users")
count = cursor.fetchone()[0]
print(f"Users remaining: {count}")

conn.close()
