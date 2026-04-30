import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))

os.environ["DATABASE_URL"] = (
    "postgresql+pg8000://postgres:postgres@localhost:5432/upskilling_platform"
)

import sqlalchemy as sa

engine = sa.create_engine(os.environ["DATABASE_URL"])
with engine.connect() as conn:
    result = conn.execute(sa.text("SELECT usename FROM pg_user"))
    users = [row[0] for row in result]
    print("Users:", users)

    result2 = conn.execute(sa.text("SELECT current_user"))
    print("Current:", result2.fetchone())

engine.dispose()
