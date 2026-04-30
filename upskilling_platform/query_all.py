import pg8000

conn = pg8000.connect(
    host="localhost",
    port=5433,
    database="upskilling_platform",
    user="upskilling",
    password="upskilling_dev_2026",
)

cursor = conn.cursor()

# List all tables
cursor.execute(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
)
tables = [r[0] for r in cursor.fetchall()]
print("Tables:", tables)

# Check users count
cursor.execute("SELECT COUNT(*) FROM users")
print("\nUsers count:", cursor.fetchone()[0])

# Check tenants count
cursor.execute("SELECT COUNT(*) FROM tenants")
print("Tenants count:", cursor.fetchone()[0])

# Check teams count
cursor.execute("SELECT COUNT(*) FROM teams")
print("Teams count:", cursor.fetchone()[0])

# Check enrollments count
cursor.execute("SELECT COUNT(*) FROM enrollments")
print("Enrollments count:", cursor.fetchone()[0])

# Check courses count
cursor.execute("SELECT COUNT(*) FROM courses")
print("Courses count:", cursor.fetchone()[0])

conn.close()
