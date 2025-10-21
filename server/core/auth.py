from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Optional

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

import asyncpg
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext

if TYPE_CHECKING:
    from .schemas import User, UserCreate, UserUpdate, UserInDB


# Password hashing
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# JWT settings
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", "1"))
ACCESS_TOKEN_EXPIRE_MINUTES = ACCESS_TOKEN_EXPIRE_DAYS * 24 * 60

# Security scheme
security = HTTPBearer()

# Password utilities - Argon2 has no length restrictions!

# Database schema for users
USER_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
"""


class UserRepository:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def initialise(self) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(USER_SCHEMA_SQL)

    async def create_user(self, user_create: "UserCreate") -> Optional["User"]:
        from .schemas import User
        
        hashed_password = pwd_context.hash(user_create.password)
        
        async with self._pool.acquire() as conn:
            try:
                row = await conn.fetchrow(
                    """
                    INSERT INTO users (username, email, name, hashed_password)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id, username, email, name, created_at, updated_at
                    """,
                    user_create.username,
                    user_create.email,
                    user_create.name,
                    hashed_password,
                )
                if row:
                    return User(
                        id=str(row["id"]),
                        username=row["username"],
                        email=row["email"],
                        name=row["name"],
                        created_at=row["created_at"],
                        updated_at=row["updated_at"],
                    )
            except asyncpg.UniqueViolationError:
                return None
        return None

    async def get_user_by_username(self, username: str) -> Optional["UserInDB"]:
        from .schemas import UserInDB
        
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, username, email, name, hashed_password, created_at, updated_at
                FROM users WHERE username = $1
                """,
                username,
            )
            if row:
                return UserInDB(
                    id=str(row["id"]),
                    username=row["username"],
                    email=row["email"],
                    name=row["name"],
                    hashed_password=row["hashed_password"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
        return None

    async def get_user_by_id(self, user_id: str) -> Optional["User"]:
        from .schemas import User
        
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, username, email, name, created_at, updated_at
                FROM users WHERE id = $1
                """,
                user_id,
            )
            if row:
                return User(
                    id=str(row["id"]),
                    username=row["username"],
                    email=row["email"],
                    name=row["name"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
        return None

    async def update_user(self, user_id: str, user_update: "UserUpdate") -> Optional["User"]:
        from .schemas import User
        update_fields = []
        params = []
        param_count = 1

        if user_update.name is not None:
            update_fields.append(f"name = ${param_count}")
            params.append(user_update.name)
            param_count += 1

        if user_update.password is not None:
            update_fields.append(f"hashed_password = ${param_count}")
            params.append(pwd_context.hash(user_update.password))
            param_count += 1

        if not update_fields:
            return await self.get_user_by_id(user_id)

        update_fields.append(f"updated_at = NOW()")
        params.append(user_id)

        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE users SET {', '.join(update_fields)}
                WHERE id = ${param_count}
                RETURNING id, username, email, name, created_at, updated_at
                """,
                *params,
            )
            if row:
                return User(
                    id=str(row["id"]),
                    username=row["username"],
                    email=row["email"],
                    name=row["name"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
        return None


# Authentication utilities
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def authenticate_user(user_repo: UserRepository, username: str, password: str) -> Optional["UserInDB"]:
    user = await user_repo.get_user_by_username(username)
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user_repo: UserRepository = None,
) -> "User":
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    if user_repo is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User repository not initialized"
        )
    
    user = await user_repo.get_user_by_id(user_id)
    if user is None:
        raise credentials_exception
    return user