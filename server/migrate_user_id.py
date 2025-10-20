"""
Migration script to add user_id column to existing conversations table.
This should be run after deploying the authentication changes.
"""

import asyncio
import os

import asyncpg


async def migrate_conversations():
    """Add user_id column to existing conversations and create a default admin user."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL environment variable is not set")
        return

    conn = await asyncpg.connect(database_url)
    
    try:
        # Check if user_id column already exists
        column_exists = await conn.fetchval("""
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'conversations' AND column_name = 'user_id'
        """)
        
        if column_exists:
            print("user_id column already exists in conversations table")
            return

        print("Starting migration...")
        
        # Create a default admin user if users table is empty
        user_count = await conn.fetchval("SELECT COUNT(*) FROM users")
        if user_count == 0:
            print("Creating default admin user...")
            from core.auth import pwd_context
            
            hashed_password = pwd_context.hash("admin123")  # Change this password!
            admin_user_id = await conn.fetchval("""
                INSERT INTO users (username, email, name, hashed_password)
                VALUES ('admin', 'admin@example.com', 'Admin User', $1)
                RETURNING id
            """, hashed_password)
            print(f"Created admin user with ID: {admin_user_id}")
        else:
            # Get the first user to assign existing conversations to
            admin_user_id = await conn.fetchval("SELECT id FROM users ORDER BY created_at LIMIT 1")
            print(f"Using existing user ID: {admin_user_id}")

        # Add user_id column to conversations table
        print("Adding user_id column to conversations table...")
        await conn.execute("ALTER TABLE conversations ADD COLUMN user_id UUID")
        
        # Update all existing conversations to belong to the admin user
        print("Updating existing conversations...")
        updated_count = await conn.fetchval("""
            UPDATE conversations 
            SET user_id = $1 
            WHERE user_id IS NULL
            RETURNING count(*)
        """, admin_user_id)
        print(f"Updated {updated_count} conversations")
        
        # Make user_id NOT NULL and add foreign key constraint
        print("Adding constraints...")
        await conn.execute("ALTER TABLE conversations ALTER COLUMN user_id SET NOT NULL")
        await conn.execute("""
            ALTER TABLE conversations 
            ADD CONSTRAINT fk_conversations_user_id 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        """)
        
        # Create index
        await conn.execute("CREATE INDEX idx_conversations_user_id ON conversations(user_id)")
        
        print("Migration completed successfully!")
        
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate_conversations())