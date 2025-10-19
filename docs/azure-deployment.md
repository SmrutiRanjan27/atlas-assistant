# Azure AKS Deployment Guide

This walkthrough shows how to containerise the FastAPI backend and Next.js frontend, push the images to Azure Container Registry (ACR), and run everything on Azure Kubernetes Service (AKS). Adapt the values (resource names, regions, domains, image tags) to match your environment.

If you are looking for a simpler local setup, use the Docker Compose workflow described below and only move to AKS once you are ready for production.

## Prerequisites
- Azure CLI `az`, Docker CLI, kubectl, and Helm installed locally.
- An Azure subscription with permissions to create ACR, AKS, and (optionally) Azure Database for PostgreSQL.
- DNS names ready for the public endpoints (e.g. `app.example.com` and `api.example.com`).
- API keys for OpenAI, Tavily, and LangSmith.

> **Important:** Provision a managed PostgreSQL instance (for example Azure Database for PostgreSQL – Flexible Server) and note its connection string. The FastAPI service requires `DATABASE_URL` with SSL enabled (set `sslmode=require`).

## Local development with Docker Compose
The repository now includes `docker-compose.yml`, which spins up PostgreSQL, the FastAPI backend, and the Next.js frontend with a single command.

1. Populate `server/.env` with your API keys (the existing format is compatible).
2. Run the stack:
   ```bash
   docker compose up --build
   ```
3. Access the services:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - PostgreSQL: exposed on port 5432 with `postgres/postgres` credentials (the backend container automatically uses `postgresql://postgres:postgres@postgres:5432/atlas`).

When you are ready to ship to Azure, continue with the AKS sections that follow.

## 1. Define shell variables
```bash
RESOURCE_GROUP=perplexity-rg
LOCATION=westeurope
ACR_NAME=perplexityacr
AKS_NAME=perplexity-aks
IMAGE_TAG=v1
APP_DOMAIN=app.example.com
API_DOMAIN=api.example.com
```

## 2. Provision Azure resources
```bash
az login
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
az acr create --resource-group "$RESOURCE_GROUP" --name "$ACR_NAME" --sku Standard
az aks create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$AKS_NAME" \
  --node-count 2 \
  --enable-managed-identity \
  --attach-acr "$ACR_NAME"
```

Attach the cluster to your local kubeconfig:
```bash
az aks get-credentials --resource-group "$RESOURCE_GROUP" --name "$AKS_NAME"
```

## 3. Build and push container images
Log in to ACR and cache the login server:
```bash
ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query "loginServer" --output tsv)
az acr login --name "$ACR_NAME"
```

Build the FastAPI backend image (default stage of the Dockerfile):
```bash
docker build -t ${ACR_LOGIN_SERVER}/perplexity-backend:${IMAGE_TAG} .
docker push ${ACR_LOGIN_SERVER}/perplexity-backend:${IMAGE_TAG}
```

Build the Next.js frontend (pass the public API endpoint so the static bundle points at the ingress host):
```bash
docker build \
  --target client \
  --build-arg NEXT_PUBLIC_ASSISTANT_API="https://${API_DOMAIN}" \
  -t ${ACR_LOGIN_SERVER}/perplexity-frontend:${IMAGE_TAG} .
docker push ${ACR_LOGIN_SERVER}/perplexity-frontend:${IMAGE_TAG}
```

## 4. Install an ingress controller
If your AKS cluster does not already have one, install NGINX Ingress via Helm:
```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace
```

## 5. Prepare Kubernetes manifests
Update the placeholders in the manifests under `deploy/k8s/`:
- Replace `<ACR_LOGIN_SERVER>/perplexity-backend:latest` and `<ACR_LOGIN_SERVER>/perplexity-frontend:latest` with `${ACR_LOGIN_SERVER}/perplexity-backend:${IMAGE_TAG}` and `${ACR_LOGIN_SERVER}/perplexity-frontend:${IMAGE_TAG}`.
- Replace `app.example.com` / `api.example.com` and the TLS secret name in `deploy/k8s/ingress.yaml`.
- Update the `NEXT_PUBLIC_ASSISTANT_API` environment variable inside `deploy/k8s/frontend.yaml` so it matches the public API host you used at build time.
- Edit `deploy/k8s/secret-template.yaml` with your real API keys and database URL (ensure `sslmode=require`).

Apply the namespace first:
```bash
kubectl apply -f deploy/k8s/namespace.yaml
```

Create the application secret (either edit `secret-template.yaml` and apply it, or use `kubectl create secret generic ...`):
```bash
kubectl apply -f deploy/k8s/secret-template.yaml
```

Deploy backend, frontend, and ingress:
```bash
kubectl apply -f deploy/k8s/backend.yaml
kubectl apply -f deploy/k8s/frontend.yaml
kubectl apply -f deploy/k8s/ingress.yaml
```

## 6. Configure TLS and DNS
Create a TLS secret (`perplexity-tls` in the example) that matches your certificate. You can:
- Use `kubectl create secret tls perplexity-tls --cert=cert.pem --key=key.pem -n perplexity-clone`, or
- Install cert-manager and issue a certificate with Let’s Encrypt.

Point your DNS A-records (`app.example.com` and `api.example.com`) to the ingress controller’s public IP (`kubectl get svc ingress-nginx-controller -n ingress-nginx`).

## 7. Verify the deployment
```bash
kubectl get pods -n perplexity-clone
kubectl get ingress -n perplexity-clone
```

Test each endpoint:
```bash
curl -I https://${API_DOMAIN}/conversations
open https://${APP_DOMAIN}/   # or visit in your browser
```

## 8. Operational considerations
- **Scaling:** Adjust the `replicas` values in the deployment manifests and/or configure Horizontal Pod Autoscalers.
- **Secrets rotation:** ACR images can stay the same; update the secret and restart pods with `kubectl rollout restart deployment/<name> -n perplexity-clone`.
- **Database connectivity:** Ensure the PostgreSQL server allows connections from the AKS subnet (use VNet integration or firewall rules).
- **Logging & monitoring:** Integrate with Azure Monitor / Container Insights for cluster metrics and logs.

This setup provides a production-ready baseline; enhance it with infrastructure-as-code (Bicep/Terraform), CI/CD, and automated certificate management to fit your organisation’s standards.
