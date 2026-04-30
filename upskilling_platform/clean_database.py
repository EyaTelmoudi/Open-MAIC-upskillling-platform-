import pg8000

conn = pg8000.connect(
    host="localhost",
    port=5433,
    database="upskilling_platform",
    user="upskilling",
    password="upskilling_dev_2026",
)

cursor = conn.cursor()

print("=== Cleaning Database for Production ===\n")

# Delete in correct order (respecting foreign key constraints)
# Child tables first, then parent tables
tables_to_clear = [
    # Agent & AI Memory tables (if they exist)
    "agent_memories",
    "content_chunk_embeddings",
    "embedding_cache",
    "content_chunks",
    "skill_edges",
    "skill_nodes",
    "content_source_metadata",
    # Quiz & Assessment attempts
    "quiz_attempts",
    # Learning content relationships
    "user_progress",
    "course_assignments",
    "bookmarks",
    "course_reviews",
    "enrollments",
    # Certificates & badges
    "certificates",
    "user_badges",
    "user_streaks",
    # Goals & teams
    "user_goals",
    "team_goals",
    "team_memberships",
    # Notifications & tokens
    "notifications",
    "course_preview_tokens",
    # XP & level tracking
    "xp_transactions",
    "user_levels",
    # Audit logs
    "super_admin_audit_logs",
    "identity_audit_logs",
    "role_mapping_rules",
    # Content hierarchy (must clear child tables before parent tables)
    # lessons depends on modules; assessments depends on modules; questions depends on assessments
    # Order: lessons (child of modules), questions (child of assessments), assessments (child of modules), modules (child of courses), courses
    "lessons",
    "questions",
    "assessments",
    "modules",
    "courses",
    # Teams (depends on users and tenants)
    "teams",
    # Users (depends on tenants) - will be handled before deletion
    "users",
    # Tenants (depends on users via created_by_id) - must be last
    "tenants",
]

for table in tables_to_clear:
    try:
        # Special handling: before deleting users, break the FK from tenants.created_by_id -> users.id
        if table == "users":
            cursor.execute("UPDATE tenants SET created_by_id = NULL")
            conn.commit()
            print("[OK] Cleared tenants.created_by_id references")

        cursor.execute(f"DELETE FROM {table}")
        conn.commit()
        print(f"[OK] Cleared {table}")
    except Exception as e:
        # Only show error if table actually exists (ignore "does not exist")
        if "does not exist" not in str(e):
            print(f"[ERROR] Error clearing {table}: {e}")
        conn.rollback()

# Reset system config
cursor.execute("UPDATE system_config SET setup_completed = false WHERE id = 1")
conn.commit()
print("[OK] Reset setup_completed to false")

# Reset all sequences (auto-increment IDs) for a truly fresh DB
print("\n[OK] Resetting sequences...")
sequences = [
    "users",
    "courses",
    "modules",
    "lessons",
    "assessments",
    "questions",
    "quiz_attempts",
    "enrollments",
    "course_assignments",
    "user_progress",
    "xp_transactions",
    "user_levels",
    "teams",
    "team_memberships",
    "user_goals",
    "team_goals",
    "notifications",
    "course_preview_tokens",
    "certificates",
    "user_badges",
    "user_streaks",
    "role_mapping_rules",
    "identity_audit_logs",
    "super_admin_audit_logs",
    "bookmarks",
    "course_reviews",
]

for table in sequences:
    try:
        cursor.execute(
            f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), 1, false)"
        )
    except Exception:
        pass  # Sequence or table doesn't exist, skip silently

conn.commit()
print("[OK] All sequences reset")

# Verify
cursor.execute("SELECT COUNT(*) FROM users")
user_count = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(*) FROM tenants")
tenant_count = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(*) FROM courses")
course_count = cursor.fetchone()[0]

cursor.execute("SELECT setup_completed FROM system_config WHERE id = 1")
setup_status = cursor.fetchone()[0]

print(f"\n=== Final Status ===")
print(f"Tenants remaining: {tenant_count}")
print(f"Users remaining: {user_count}")
print(f"Courses remaining: {course_count}")
print(f"Setup completed: {setup_status}")

conn.close()
print("\n[OK] Database cleaned for production!")
print("[INFO] All data removed. Platform is now ready for initial setup.")
