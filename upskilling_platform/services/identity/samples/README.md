# Sample User Import CSV

This file can be used to test the bulk user import feature (`POST /api/v1/users/import`).

## CSV Format

| Column | Required | Description |
|--------|---------|------------|
| email | Yes | User email address |
| first_name | Yes | User first name |
| last_name | Yes | User last name |
| role | Yes | One of: Admin, Manager, LearningExpert, TeamManager, TeamMember, TeamIntern |
| department | No | User department |

## Sample Data

This CSV contains 8 sample users with different roles and departments.

## Usage

1. Login as Admin
2. Go to Admin Users page or use API
3. Upload this CSV file via `POST /api/v1/users/import`
4. Users will be created with auto-generated temporary passwords
5. Check the response for success/skipped counts

## Note

- Duplicate emails will be skipped
- Invalid roles will be reported in errors
- All users are created with `local` auth provider and `active` status