"""
Script to drop all tables and start fresh.
This will remove all data - use with caution!
"""

import asyncio
import os

import asyncpg
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


async def drop_all_tables():
    """Drop all tables to start fresh."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL environment variable is not set")
        return

    conn = await asyncpg.connect(database_url)
    
    try:
        print("Dropping all tables...")
        
        # Drop tables in correct order (child tables first)
        tables_to_drop = [
            "conversations",
            "users"
        ]
        
        for table in tables_to_drop:
            try:
                await conn.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
                print(f"Dropped table: {table}")
            except Exception as e:
                print(f"Error dropping {table}: {e}")
        
        # Also drop any checkpoint tables from langgraph if they exist
        checkpoint_tables = [
            "checkpoints",
            "checkpoint_blobs", 
            "checkpoint_writes"
        ]
        
        for table in checkpoint_tables:
            try:
                await conn.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
                print(f"Dropped checkpoint table: {table}")
            except Exception as e:
                # These might not exist, so just continue
                pass
        
        print("All tables dropped successfully!")
        print("You can now restart your server and it will recreate the tables with the new schema.")
        
    except Exception as e:
        print(f"Error dropping tables: {e}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(drop_all_tables())