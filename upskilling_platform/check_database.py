import pg8000

conn = pg8000.connect(
    host="localhost",
    port=5433,
    database="upskilling_platform",
    user="upskilling",
    password="upskilling_dev_2026",
)

cursor = conn.cursor()

print("=== Current Database State ===\n")

# Check setup status
cursor.execute("SELECT platform_name, setup_completed FROM system_config WHERE id = 1")
config = cursor.fetchone()
print(f"Platform: {config[0]}")
print(f"Setup Completed: {config[1]}\n")

# Count records in each table
tables = [
    "users",
    "tenants",
    "courses",
    "modules",
    "lessons",
    "enrollments",
    "teams",
    "user_goals",
    "xp_transactions",
    "super_admin_audit_logs",
]

print("=== Table Counts ===")
for table in tables:
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        count = cursor.fetchone()[0]
        print(f"{table}: {count}")
    except:
        print(f"{table}: table not found")

# Show users if any
print("\n=== Users ===")
cursor.execute("SELECT id, email, first_name, last_name, role, status FROM users")
users = cursor.fetchall()
for user in users:
    print(f"  {user[1]} - {user[2]} {user[3]} | Role: {user[4]} | Status: {user[5]}")

# Show tenants if any
print("\n=== Tenants ===")
cursor.execute("SELECT id, name, slug, status FROM tenants")
tenants = cursor.fetchall()
for tenant in tenants:
    print(f"  {tenant[1]} ({tenant[2]}) - Status: {tenant[3]}")

conn.close()
