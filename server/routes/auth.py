"""
Authentication routes for the server application
"""

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from core import (
    Token,
    User,
    UserCreate,
    UserLogin,
    UserRepository,
    UserUpdate,
    authenticate_user,
    create_access_token,
    get_current_user,
)
from core.auth import ACCESS_TOKEN_EXPIRE_MINUTES, security
from dependencies import get_user_repository

router = APIRouter(prefix="/auth", tags=["authentication"])


async def get_current_user_dep(
    credentials=Depends(security),
    user_repo: UserRepository = Depends(get_user_repository),
) -> User:
    """Get current authenticated user"""
    return await get_current_user(credentials, user_repo)


@router.post("/register", response_model=User, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate, 
    user_repo: UserRepository = Depends(get_user_repository)
) -> User:
    """Register a new user"""
    user = await user_repo.create_user(user_data)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already exists"
        )
    return user


@router.post("/login", response_model=Token)
async def login(
    user_credentials: UserLogin,
    user_repo: UserRepository = Depends(get_user_repository)
) -> Token:
    """Authenticate user and return access token"""
    user = await authenticate_user(
        user_repo, 
        user_credentials.username, 
        user_credentials.password
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.id}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=User)
async def get_current_user_info(
    current_user: User = Depends(get_current_user_dep)
) -> User:
    """Get current user information"""
    return current_user


@router.put("/profile", response_model=User)
async def update_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user_dep),
    user_repo: UserRepository = Depends(get_user_repository)
) -> User:
    """Update user profile"""
    updated_user = await user_repo.update_user(current_user.id, user_update)
    if updated_user is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update user profile"
        )
    return updated_user