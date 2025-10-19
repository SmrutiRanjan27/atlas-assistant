# syntax=docker/dockerfile:1.6

###############################################################################
# Client image (Next.js)
###############################################################################
ARG NODE_VERSION=20
ARG PYTHON_VERSION=3.11
FROM node:${NODE_VERSION}-alpine AS client-deps
WORKDIR /app/client

# Install full dependency set (prod + dev) for building the frontend
COPY client/package.json client/package-lock.json ./
RUN npm ci

FROM client-deps AS client-build
ARG NEXT_PUBLIC_ASSISTANT_API
ARG NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_ASSISTANT_API=${NEXT_PUBLIC_ASSISTANT_API}
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}
WORKDIR /app/client
COPY client/ .
RUN mkdir -p public
RUN npm run build

# Runtime image that only contains production dependencies and the compiled app
FROM node:${NODE_VERSION}-alpine AS client
ARG NEXT_PUBLIC_ASSISTANT_API
ARG NEXT_PUBLIC_API_BASE
WORKDIR /app/client
ENV NODE_ENV=production
ENV NEXT_PUBLIC_ASSISTANT_API=${NEXT_PUBLIC_ASSISTANT_API}
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}

COPY client/package.json client/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=client-build /app/client/.next ./.next
COPY --from=client-build /app/client/public ./public
COPY --from=client-build /app/client/next.config.mjs ./next.config.mjs
COPY --from=client-build /app/client/tailwind.config.ts ./tailwind.config.ts
COPY --from=client-build /app/client/tsconfig.json ./tsconfig.json

EXPOSE 3000
CMD ["npm", "run", "start"]

###############################################################################
# Server image (FastAPI)
###############################################################################
FROM python:${PYTHON_VERSION}-slim AS server

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/home/appuser/.local/bin:${PATH}"

WORKDIR /app/server

# System dependencies for psycopg/asyncpg
RUN apt-get update \
    && apt-get install --no-install-recommends -y build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY server/requirements.txt .
RUN python -m pip install --upgrade pip \
    && pip install -r requirements.txt

COPY server/ .

RUN rm -f .env

RUN adduser --disabled-password --gecos "" appuser \
    && chown -R appuser:appuser /app/server

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
