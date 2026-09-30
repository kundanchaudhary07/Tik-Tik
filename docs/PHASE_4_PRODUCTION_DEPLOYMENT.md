# Phase 4 — Production Deployment & Cloud Infrastructure Manual

## Architectural Summary
This document provides the complete, authoritative operational and architectural manual for taking the Productivity Platform from local development to production cloud deployment on **AWS (Amazon Web Services)** and modern managed cloud platforms.

---

## Table of Contents
1. [Part 1 — Target Production Architecture](#part-1--target-production-architecture)
2. [Part 2 — Environment Separation & Isolation](#part-2--environment-separation--isolation)
3. [Part 3 — Production Multi-Stage Dockerfiles](#part-3--production-multi-stage-dockerfiles)
4. [Part 4 — Docker Compose & Container Networking](#part-4--docker-compose--container-networking)
5. [Part 5 — Configuration & Secrets Management](#part-5--configuration--secrets-management)
6. [Part 6 & 7 — CI/CD Pipeline & GitHub Actions Workflows](#part-6--7--cicd-pipeline--github-actions-workflows)
7. [Part 8 — Safe Database Migrations in Production](#part-8--safe-database-migrations-in-production)
8. [Part 9 & 10 — Frontend & Backend Deployment](#part-9--10--frontend--backend-deployment)
9. [Part 11 & 12 — Managed PostgreSQL (RDS) & Managed Redis (ElastiCache)](#part-11--12--managed-postgresql-rds--managed-redis-elasticache)
10. [Part 13, 14 & 15 — AWS VPC, Subnets & Security Groups](#part-13-14--15--aws-vpc-subnets--security-groups)
11. [Part 16 & 17 — ECS Fargate API & Separate Background Worker](#part-16--17--ecs-fargate-api--separate-background-worker)
12. [Part 18, 19 & 20 — ALB, HTTPS, SSL/TLS & DNS Configuration](#part-18-19--20--alb-https-ssltls--dns-configuration)
13. [Part 21 & 22 — Amazon S3 & CloudFront CDN](#part-21--22--amazon-s3--cloudfront-cdn)
14. [Part 23 & 24 — IAM Least Privilege & AWS Secrets Manager](#part-23--24--iam-least-privilege--aws-secrets-manager)
15. [Part 25 & 26 — Production CORS, Cookies & JWT Security](#part-25--26--production-cors-cookies--jwt-security)
16. [Part 27 — Database Connection Pool Sizing Math](#part-27--database-connection-pool-sizing-math)
17. [Part 28 & 29 — Zero-Downtime Rolling Deployments & Rollback Procedure](#part-28--29--zero-downtime-rolling-deployments--rollback-procedure)
18. [Part 30, 31 & 32 — Observability, CloudWatch & Health Checks](#part-30-31--32--observability-cloudwatch--health-checks)
19. [Part 33 — Database Backups, Snapshots & Disaster Recovery](#part-33--database-backups-snapshots--disaster-recovery)
20. [Part 34 — Deployment Failure Lab (12 Real-World Scenarios)](#part-34--deployment-failure-lab-12-real-world-scenarios)
21. [Part 35 — Production Security Review Audit](#part-35--production-security-review-audit)
22. [Part 36 & 37 — CI/CD Failure Test & Deployment Versioning](#part-36--37--cicd-failure-test--deployment-versioning)
23. [Part 38 & 39 — Admin Operations & Production Real Email Verification](#part-38--39--admin-operations--production-real-email-verification)
24. [Part 40 — Final End-to-End Production Request Flow](#part-40--final-end-to-end-production-request-flow)
25. [Monthly Infrastructure Cost Estimates](#monthly-infrastructure-cost-estimates)

---

## Part 1 — Target Production Architecture

```text
                           INTERNET / CLIENTS
                                   │
                                 HTTPS (Port 443 via ACM)
                                   ▼
                       ┌────────────────────────┐
                       │   Amazon Route 53      │
                       │ app.example.com / api  │
                       └───────────┬────────────┘
                                   │
          ┌────────────────────────┴────────────────────────┐
          ▼                                                 ▼
┌───────────────────┐                             ┌───────────────────┐
│ Amazon CloudFront │ (Static SPA Assets)         │ Application Load  │ (Dynamic REST APIs)
│   (CDN Edge)      │                             │   Balancer (ALB)  │
└─────────┬─────────┘                             └─────────┬─────────┘
          │ Origin Request                                  │ Target Group (Port 8001)
          ▼                                                 ▼
┌───────────────────┐                             ┌───────────────────────────────┐
│     Amazon S3     │                             │    AWS VPC (10.0.0.0/16)      │
│ (Frontend Bucket) │                             │  Private Subnets (No Pub IP)  │
└───────────────────┘                             │                               │
                                                  │  ┌─────────────────────────┐  │
                                                  │  │ Amazon ECS (Fargate)    │  │
                                                  │  │ Service: API (Tasks xN) │  │
                                                  │  └──────────┬──────────────┘  │
                                                  │             │                 │
                                                  │  ┌──────────▼──────────────┐  │
                                                  │  │ Amazon ECS (Fargate)    │  │
                                                  │  │ Service: Worker (Tasks) │  │
                                                  │  └─────┬──────────────┬────┘  │
                                                  │        │              │       │
                                                  │        ▼              ▼       │
                                                  │ ┌────────────┐ ┌────────────┐ │
                                                  │ │ElastiCache │ │ Amazon RDS │ │
                                                  │ │Redis 7.x   │ │Postgres 15 │ │
                                                  │ └────────────┘ └────────────┘ │
                                                  └───────────────────────────────┘
                                                                   │ (Outbound TLS via NAT)
                                                                   ▼
                                                          ┌──────────────────┐
                                                          │   Google Gmail   │
                                                          │    SMTP Relay    │
                                                          └──────────────────┘
```

### Component Breakdown
1. **Route 53**: Global authoritative DNS resolving `app.domain.com` (CloudFront alias) and `api.domain.com` (ALB alias).
2. **CloudFront CDN**: Distributes pre-rendered React bundles globally to 400+ edge locations with TLS 1.3, Brotli/Gzip compression, and microsecond latency.
3. **Application Load Balancer (ALB)**: Public-facing Layer 7 load balancer terminating TLS via AWS Certificate Manager (ACM), performing health checks against `/health/ready`, and distributing traffic across ECS tasks.
4. **ECS Fargate (API Service)**: Serverless container compute running the FastAPI/Express application. Auto-scales horizontally based on CPU/Memory and request count.
5. **ECS Fargate (Worker Service)**: Dedicated background worker running independently from API containers. Processes Redis notification queues, executes exponential backoff retries, and coordinates the dead-letter queue.
6. **Amazon RDS PostgreSQL (Multi-AZ)**: Managed relational database with automated backups, synchronous replication to a secondary availability zone, and automated failover.
7. **Amazon ElastiCache for Redis**: In-memory data store providing sub-millisecond queue operations, distributed row locks (`SKIP LOCKED` fallback), and atomic worker lease tracking.
8. **AWS Secrets Manager**: Encrypted vault managing database credentials, JWT `SECRET_KEY`, and SMTP credentials with automatic secret rotation capabilities.
9. **Amazon CloudWatch**: Centralized observability platform aggregating JSON logs, tracing metrics (CPU, Memory, 5xx error rate, queue depth), and triggering alert alarms.
10. **Amazon S3**: Immutable object storage for frontend static assets and user document exports with versioning and lifecycle policies.

---

## Part 2 — Environment Separation & Isolation

Production, Staging, and Local Development must remain strictly decoupled across networks, databases, and credentials.

| Environment | Purpose | Infrastructure | Database | Credentials Source |
|---|---|---|---|---|
| **Local** | Feature development & quick iteration | Docker Compose (`db`, `redis`, `backend`, `frontend`) | Local PostgreSQL container | `.env` (git-ignored) |
| **Test / CI** | Automated verification, linting, pytest | GitHub Actions ephemeral runners & service containers | Ephemeral PostgreSQL service container | GitHub Actions Environment Secrets |
| **Staging** | Mirror of production for pre-release validation | Isolated AWS VPC / Render staging cluster | Dedicated Staging RDS instance | AWS Secrets Manager (Staging prefix) |
| **Production** | Live customer traffic | Multi-AZ AWS VPC, ECS Fargate, ALB, CloudFront | Multi-AZ RDS PostgreSQL with read replica | AWS Secrets Manager (`prod/*`) via IAM |

### Why Environments Must Never Share Credentials
- **Blast Radius Containment**: A developer running tests or database seeds locally must never accidentally flush or overwrite production tables.
- **Compliance & Privacy (GDPR/SOC2)**: Production contains real user emails and hashed credentials. Staging and local environments must only contain sanitized or generated test data.
- **Independent Secret Rotation**: Rotating a database password or SMTP key in production must never break a developer's local workstation build.

---

## Part 3 — Production Multi-Stage Dockerfiles

### 1. Frontend Dockerfile (`docker/frontend.Dockerfile`)
- **Stage 1 (Builder)**: Uses `node:20-slim`. Copies lockfiles and runs `npm install` followed by `npm run build`. Development dependencies and node binaries are discarded.
- **Stage 2 (Runtime)**: Uses minimal `nginx:alpine`. Copies only the static output `/app/dist` to `/usr/share/nginx/html`.
- **Security**: Custom `nginx.conf` injects strict security headers (`X-Frame-Options`, `Content-Security-Policy`, `X-Content-Type-Options`), enables gzip, and handles SPA client routing.
- **Health Check**: `wget -q --spider http://127.0.0.1/healthz || exit 1`.

### 2. Backend Dockerfile (`docker/backend.Dockerfile`)
- **Stage 1 (Builder)**: Uses `python:3.10-slim`. Installs `build-essential` and `libpq-dev` to compile C extensions into an isolated virtualenv (`/opt/venv`).
- **Stage 2 (Runtime)**: Minimal `python:3.10-slim`. Installs only runtime `libpq5` and `curl`. Copies the virtualenv without gcc or dev packages, saving over 450MB of image weight.
- **Non-root User**: Creates user `appuser` (UID 10001, GID 10001) and sets file permissions. Never runs as root in production.
- **Health Check**: `HEALTHCHECK CMD curl -f http://localhost:8001/api/health || exit 1`.

### 3. Worker Dockerfile (`docker/worker.Dockerfile`)
- Uses identical multi-stage dependencies as the backend but overrides the entrypoint to run `python -m app.worker`.
- Separating the worker into its own container ensures that CPU-heavy email tasks, network retries, or scheduler delays never starve the web API server of threads or event-loop cycles.

---

## Part 4 — Docker Compose & Container Networking

The local orchestration file `docker-compose.yml` connects:
1. `db` (PostgreSQL 15 on port 5432)
2. `redis` (Redis 7 on port 6379)
3. `backend` (FastAPI / Express API on port 8001)
4. `worker` (Dedicated background email & reminder worker)
5. `frontend` (React + Nginx on port 3000)

### Localhost inside Container vs. Docker Service DNS
- **Localhost inside Container (`127.0.0.1`)**: Refers strictly to the network namespace of **that specific container**. If the backend container attempts to connect to `localhost:5432`, it attempts to find PostgreSQL inside its own container and fails with `Connection Refused`.
- **Docker Service DNS (`db`, `redis`, `backend`)**: Docker maintains an internal DNS server (at `127.0.0.11`). Containers attached to a custom bridge network resolve sibling service names directly to their internal private container IPs. Thus, `DATABASE_URL=postgresql://postgres:pass@db:5432/productivity_db` routes directly to the database container.

---

## Part 5 — Configuration & Secrets Management

### Environment Variable Audit & Security Rules
All runtime variables are declared in `.env.example` with zero actual passwords:
- `DATABASE_URL`: Injected at runtime; never hardcoded.
- `REDIS_URL`: Injected at runtime.
- `SECRET_KEY`: High-entropy 32-byte hexadecimal string generated via `openssl rand -hex 32`.
- `SMTP_USER` & `SMTP_PASSWORD`: Kept exclusively server-side.
- `VITE_API_URL`: Public frontend configuration pointing to the production API origin (e.g., `https://api.example.com`).

### Absolute Prohibitions
1. **Never commit `.env` to Git**. `.gitignore` includes `.env*` and `!.env.example`.
2. **Never expose backend secrets in client bundles**. Only variables prefixed with `VITE_` are bundled into frontend JavaScript; secrets like `SMTP_PASSWORD` or `DATABASE_URL` must never have `VITE_` prefixes.

---

## Part 6 & 7 — CI/CD Pipeline & GitHub Actions Workflows

Two production workflows are configured under `.github/workflows/`:

### 1. `ci.yml` (Continuous Integration)
Runs on every Pull Request and Push to `main` and `develop`:
```text
Push / PR
  │
  ├─► Lint & Typecheck (Node 20, tsc --noEmit, eslint)
  │
  ├─► Backend Pytest Suite (Postgres 15 & Redis 7 service containers, Alembic migrations)
  │
  ├─► Frontend Production Build (Vite build, bundle verification)
  │
  └─► Docker Build Verification (Builds frontend, backend, and worker Dockerfiles)
```
**Strict Gate**: If any test or type check fails, the pipeline exits with a non-zero code and halts any further deployment.

### 2. `deploy.yml` (Continuous Deployment)
Runs when a release tag is pushed (`v*.*.*`) or via manual trigger:
1. **AWS OIDC Authentication**: Uses GitHub's OpenID Connect (`aws-actions/configure-aws-credentials`) to obtain temporary, scoped STS credentials. No permanent AWS Access Key or Secret Key is stored in GitHub Secrets.
2. **ECR Login & Immutable Push**: Builds Docker images tagged with both the semantic release version (`v1.0.0`) and the short Git commit SHA (`a1b2c3d`).
3. **Database Migration Task**: Spawns an isolated Fargate migration task to run `alembic upgrade head`. The deployment pauses until the migration task finishes with exit code `0`.
4. **Zero-Downtime ECS Rolling Update**: Instructs ECS Fargate to start new task containers and verify `/health/ready` before draining and stopping older tasks.
5. **Frontend Sync & CDN Invalidation**: Uploads static files to S3 and creates an invalidation on CloudFront for `/*`.
6. **Automated Rollback Trigger**: If post-deployment health probes fail within 5 minutes, an automated rollback reverts ECS services to the previous stable task definition.

---

## Part 8 — Safe Database Migrations in Production

### Code Version vs. Schema Version
Application code and database schema evolve in lockstep:
- **Code Version**: Git commit hash / Docker tag (e.g., `v1.2.0`).
- **Schema Version**: Alembic revision identifier recorded in the `alembic_version` database table.

### The Expand/Contract (Parallel Run) Pattern
To prevent downtime when rolling out schema updates:
1. **Expand**: Add new nullable columns or tables first (Alembic migration). Old application code continues to run without error.
2. **Deploy Code**: Deploy the new application version that reads and writes both old and new columns.
3. **Contract**: Once all instances run the new version, execute a follow-up migration to remove deprecated columns or add `NOT NULL` constraints.

### Rollback Limitations on Schema Changes
- **Additive Migrations (Adding a column/table)**: Safe to roll back application code. The old code simply ignores the extra column.
- **Destructive Migrations (Dropping a column or renaming a table)**: Cannot be rolled back simply by rolling back the Docker image because the physical data was dropped. Destructive migrations must always be preceded by an automated RDS snapshot.

---

## Part 9 & 10 — Frontend & Backend Deployment

### Frontend Deployment
- **Target**: Static hosting on **Amazon S3** fronted by **CloudFront** (or Vercel).
- **Environment Injection**: `VITE_API_URL` is passed during the CI/CD build stage so API calls correctly address `https://api.example.com`.
- **Cache Strategy**: `index.html` has `Cache-Control: no-cache, no-store, must-revalidate`. Hashed JS/CSS assets (`/assets/*.js`) have `Cache-Control: public, max-age=31536000, immutable`.

### Backend Deployment
- **Target**: Containerized service on **Amazon ECS Fargate** behind an Application Load Balancer.
- **Simpler Alternative (Render)**: For smaller teams, Render Web Services with managed PostgreSQL and Redis provides a streamlined stepping stone before migrating to full AWS VPC / ECS Fargate.

---

## Part 11 & 12 — Managed PostgreSQL (RDS) & Managed Redis (ElastiCache)

### Why Managed Databases are Mandatory in Production
Running database containers on standard ephemeral virtual machines is hazardous:
- **Crash Recovery**: If an EC2 or container host dies, local volume data is locked or lost.
- **Automated Patching**: AWS RDS handles kernel and PostgreSQL minor version security patches automatically.
- **Multi-AZ Replication**: RDS Multi-AZ synchronously replicates storage to a standby instance in a different availability zone. Failover completes in under 60 seconds with zero data loss.
- **Point-in-Time Recovery (PITR)**: Enables rolling back database state to any specific second in the past 35 days.

### Managed Redis (ElastiCache)
- **Primary-Replica Setup**: Multi-AZ with automatic failover ensures queuing and scheduling continue uninterrupted.
- **Persistence (AOF/RDB)**: Prevents in-flight notification loss during maintenance restarts.
- **In-VPC Isolation**: Accessible only by API and Worker tasks inside the private subnet.

---

## Part 13, 14 & 15 — AWS VPC, Subnets & Security Groups

### VPC CIDR Design: `10.0.0.0/16`
- **Public Subnet 1 (`10.0.1.0/24`) & Public Subnet 2 (`10.0.2.0/24`)**:
  - Connected to Internet Gateway (IGW).
  - Hosts Application Load Balancers and NAT Gateways.
- **Private Subnet 1 (`10.0.11.0/24`) & Private Subnet 2 (`10.0.12.0/24`)**:
  - Outbound internet access via NAT Gateway (for downloading OS updates, connecting to Gmail SMTP).
  - Hosts ECS API Tasks and Worker Tasks.
- **Isolated Database Subnet 1 (`10.0.21.0/24`) & Isolated Database Subnet 2 (`10.0.22.0/24`)**:
  - No internet route table entry.
  - Hosts RDS PostgreSQL Multi-AZ and ElastiCache Redis clusters.

### Security Groups Matrix (Least Privilege)

| Security Group | Inbound Rules | Outbound Rules |
|---|---|---|
| **ALB-SG** | Port 80 (0.0.0.0/0), Port 443 (0.0.0.0/0) | Port 8001 -> ECS-API-SG |
| **ECS-API-SG** | Port 8001 -> Source: ALB-SG | Port 5432 -> RDS-SG, Port 6379 -> Redis-SG, Port 443 -> NAT |
| **ECS-Worker-SG** | None (Workers do not listen on inbound ports) | Port 5432 -> RDS-SG, Port 6379 -> Redis-SG, Port 587/465 -> NAT (SMTP) |
| **RDS-SG** | Port 5432 -> Sources: ECS-API-SG, ECS-Worker-SG | None |
| **Redis-SG** | Port 6379 -> Sources: ECS-API-SG, ECS-Worker-SG | None |

> **Critical Rule**: Port 5432 (PostgreSQL) and Port 6379 (Redis) **NEVER** accept traffic from `0.0.0.0/0`. Only internal ECS security groups can establish connections.

---

## Part 16 & 17 — ECS Fargate API & Separate Background Worker

### Architecture Separation
```text
ECS Cluster: "productivity-production"
├── Service 1: "productivity-api"
│   ├── Desired Count: 2 (Auto-scaling: 2 to 10)
│   ├── Launch Type: FARGATE (0.5 vCPU, 1 GB RAM)
│   ├── Task Definition: Entrypoint -> uvicorn app.main:app
│   └── Target Group: Attached to ALB (Port 8001)
│
└── Service 2: "productivity-worker"
    ├── Desired Count: 2 (Auto-scaling based on Redis queue depth)
    ├── Launch Type: FARGATE (0.5 vCPU, 1 GB RAM)
    ├── Task Definition: Entrypoint -> python -m app.worker
    └── Target Group: None (No public ingress)
```

### Why Workers Run in a Separate Service
1. **Independent Scaling**: If a marketing campaign sends 50,000 reminder emails, the Worker service scales to 10 tasks to process the queue without affecting API response latencies.
2. **Crash Isolation**: A crash in a worker thread (e.g. SMTP socket timeout or unhandled job exception) does not terminate the web API process or drop active user HTTP requests.

---

## Part 18, 19 & 20 — ALB, HTTPS, SSL/TLS & DNS Configuration

1. **ALB Listeners**:
   - **Port 80 (HTTP)**: Configured with a default redirect rule: HTTP 301 Permanent Redirect to `HTTPS :443`.
   - **Port 443 (HTTPS)**: Terminated using a valid certificate from **AWS Certificate Manager (ACM)**.
2. **Target Group & Health Check**:
   - Protocol: HTTP
   - Port: 8001
   - Path: `/health/ready`
   - Healthy threshold: 2 consecutive successes (interval: 15s)
   - Unhealthy threshold: 3 consecutive failures (interval: 5s)
3. **Route 53 DNS Records**:
   - `app.example.com` -> `A (Alias)` to CloudFront distribution (`d123456.cloudfront.net`).
   - `api.example.com` -> `A (Alias)` to ALB dualstack DNS (`prod-alb-123.us-east-1.elb.amazonaws.com`).

---

## Part 21 & 22 — Amazon S3 & CloudFront CDN

- **Ephemeral Container Filesystem**: ECS containers have stateless, ephemeral storage. Any files saved to `/tmp` disappear when a task restarts or scales down.
- **S3 for Persistent Assets**: User profile avatars, exported activity reports, and static website builds are stored in an S3 bucket with server-side encryption (`AES-256` or AWS KMS).
- **CloudFront CDN**:
  - Caches static CSS, JS, and image files across edge locations.
  - Reduces origin load on S3 by over 95%.
  - Terminates TLS at the closest edge server to the user.

---

## Part 23 & 24 — IAM Least Privilege & AWS Secrets Manager

### IAM Roles for ECS
1. **ECS Task Execution Role (`ecsTaskExecutionRole`)**:
   - Used by the AWS ECS agent itself.
   - Permissions: `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `logs:CreateLogStream`, `logs:PutLogEvents`, `secretsmanager:GetSecretValue`.
2. **ECS Task Role (`ecsTaskRole`)**:
   - Used by the application code running inside the container.
   - Permissions: `s3:PutObject`, `s3:GetObject` on `arn:aws:s3:::productivity-user-assets/*`. No broad administrative permissions.

### AWS Secrets Manager Integration
Secrets are stored in JSON format at secret path `production/productivity-platform`:
```json
{
  "DATABASE_URL": "postgresql://produser:secret@prod-db.xyz.rds.amazonaws.com:5432/productivity_db",
  "REDIS_URL": "redis://prod-redis.xyz.cache.amazonaws.com:6379/0",
  "SECRET_KEY": "8f3b2a1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1",
  "SMTP_HOST": "smtp.gmail.com",
  "SMTP_PORT": "587",
  "SMTP_USER": "notifications@productivity.io",
  "SMTP_PASSWORD": "app-specific-password-here",
  "SMTP_FROM_EMAIL": "notifications@productivity.io"
}
```
ECS injects these directly into container environment variables at launch time via `secrets` configuration in the Task Definition. Secrets are never exposed in Dockerfiles, Git repositories, or CI logs.

---

## Part 25 & 26 — Production CORS, Cookies & JWT Security

### Strict Production CORS
- `allow_origins`: Strictly restricted to `["https://app.example.com"]`.
- Wildcard `*` is strictly forbidden when `allow_credentials=True`.

### Cookie & JWT Transport Security
- **JWT Storage**: Returned as Bearer token for client-side API requests, or delivered via HTTP cookies.
- **Cookie Security Flags**:
  - `HttpOnly`: JavaScript cannot access the cookie (`document.cookie`), preventing XSS token theft.
  - `Secure`: Cookie is transmitted only over encrypted HTTPS connections.
  - `SameSite=Lax` or `Strict`: Prevents Cross-Site Request Forgery (CSRF) attacks.
- **Zero Logging**: Tokens and Authorization headers are scrubbed from all access logs.

---

## Part 27 — Database Connection Pool Sizing Math

### The Sizing Formula
$$\text{Total Potential Connections} = (N_{\text{API Tasks}} \times \text{Pool Size}) + (N_{\text{Worker Tasks}} \times \text{Worker Pool Size})$$

### Calculation Example
- RDS Instance: `db.t4g.small` (Default PostgreSQL `max_connections` = 150).
- Reserved for system & migrations = 20 connections.
- Available for applications = 130 connections.
- API Configuration:
  - Max auto-scaling tasks: 6
  - `DB_POOL_SIZE`: 10
  - `DB_MAX_OVERFLOW`: 5
  - Max API connections: $6 \times (10 + 5) = 90$ connections.
- Worker Configuration:
  - Max worker tasks: 4
  - Worker pool size: 5
  - Max worker connections: $4 \times 5 = 20$ connections.
- Total Worst-Case Usage: $90 + 20 = 110 \text{ connections } \le 130$ safe limit.

---

## Part 28 & 29 — Zero-Downtime Rolling Deployments & Rollback Procedure

### ECS Rolling Update Configuration
- `minimumHealthyPercent`: **100%** (At all times, at least 100% of desired tasks remain running and serving traffic).
- `maximumPercent`: **200%** (ECS launches new task versions alongside the old ones up to double capacity).

```text
Step 1: Current State -> [Old Task 1 (Healthy)], [Old Task 2 (Healthy)]
Step 2: Deployment Starts -> ECS launches [New Task 1], [New Task 2]
Step 3: Health Checks -> ALB pings /health/ready on New Tasks until 2 consecutive 200 OKs
Step 4: Traffic Shift -> ALB routes new requests to New Tasks
Step 5: Deregistration -> ALB deregisters Old Tasks (draining connection delay: 30s)
Step 6: Cleanup -> Old Tasks terminated cleanly. Zero dropped packets.
```

### Rollback Procedure
If new tasks fail health checks or CloudWatch detects an elevated 5xx error spike:
1. **Immediate Execution**: Run `aws ecs update-service --cluster prod --service productivity-api --task-definition productivity-api:PREVIOUS --force-new-deployment`.
2. **Draining**: The failing tasks are removed immediately from the ALB target group.
3. **Database Guard**: If a rollback occurs after a migration, verify whether the schema is backward-compatible. If a destructive migration failed, restore the pre-deployment RDS snapshot.

---

## Part 30, 31 & 32 — Observability, CloudWatch & Health Checks

### Structured JSON Logging
Every request produces a clean, machine-readable JSON log entry:
```json
{
  "timestamp": "2026-09-22T13:30:00.123Z",
  "level": "INFO",
  "request_id": "req-9c8b7a6d",
  "method": "POST",
  "path": "/api/activities",
  "status_code": 201,
  "latency_ms": 14,
  "user_id": 4,
  "client_ip": "203.0.113.19"
}
```

### CloudWatch Metric Alarms
1. **High 5xx Rate**: Triggers if 5xx errors exceed 1% over 3 minutes -> Sends SNS alert to PagerDuty/Slack.
2. **P99 Latency High**: Triggers if response time exceeds 800ms for 5 minutes.
3. **Queue Backlog (DLQ Growth)**: Triggers if `queue:dead_letter` length $> 0$ -> Alerts on-call engineering.
4. **RDS Connection Exhaustion**: Triggers if database connections $> 80\%$ of pool limit.

### Health Check Endpoints
- `/health/live`: Shallow process liveness. Returns `200 OK` if the Python/Node process is running. Used by Docker/ECS process supervisors to restart dead containers.
- `/health/ready`: Deep dependency readiness. Actively checks `SELECT 1` on PostgreSQL and `PING` on Redis. Returns `200 OK` if all dependencies are responsive; returns `503 Service Unavailable` if the database is unreachable. Used by ALB target groups.

---

## Part 33 — Database Backups, Snapshots & Disaster Recovery

- **Automated RDS Backups**: Enabled with a 30-day retention window. Captured daily during low-traffic maintenance windows.
- **Transaction Logs (WAL)**: Streamed continuously to S3 every 5 minutes, allowing Point-in-Time Recovery to any specific minute.
- **Manual Snapshots**: Automatically executed by the CI/CD pipeline immediately before running any database migration.
- **Recovery Time Objective (RTO)**: $< 15$ minutes to restore a new RDS instance from snapshot.
- **Recovery Point Objective (RPO)**: $< 5$ minutes of data loss maximum in catastrophic regional failure.

---

## Part 34 — Deployment Failure Lab (12 Real-World Scenarios)

| # | Failure Scenario | Observable Symptom | CloudWatch / Container Log | Root Cause | Immediate Fix | Rollback Procedure |
|---|---|---|---|---|---|---|
| 1 | **Invalid DATABASE_URL** | Backend crashes on boot; `/health/ready` returns 503. | `OperationalError: could not translate host name "db-prod" to address` | Typo in secret hostname or missing VPC DNS resolution. | Correct database hostname in Secrets Manager and redeploy. | Revert to previous task definition with known-good secret ARN. |
| 2 | **Redis Unavailable** | Email jobs fail to enqueue; background worker logs connection errors. | `redis.exceptions.ConnectionError: Error 111 connecting to redis:6379` | Security group blocking port 6379 or Redis node undergoing failover. | Update Redis Security Group to allow inbound from ECS-API-SG. | Worker pauses, jobs remain in DB; no manual rollback needed once network unblocks. |
| 3 | **Wrong SMTP Credentials** | Outbound verification/reminder emails fail; jobs transition to RETRYING. | `SMTPAuthenticationError: (535, '5.7.8 Username and Password not accepted')` | Expired Google App Password or credential typo. | Generate fresh Gmail App Password, update Secrets Manager secret. | Re-queue failed email jobs via Admin Portal DLQ retry button. |
| 4 | **Migration Failure** | CI/CD pipeline halts; new service is NOT deployed. | `alembic.util.exc.CommandError: Can't locate revision identified by 'c960e777dd86'` | Missing migration script in repository or branching merge conflict. | Re-generate migration revision locally and merge to `main`. | Pipeline automatically halts; live production remains on previous stable version. |
| 5 | **Backend Deployment Fails** | ECS task fails to reach running state; task stopped reason shown. | `Container exited with code 1: ModuleNotFoundError: No module named 'new_dep'` | Missing dependency in `requirements.txt`. | Add dependency to `requirements.txt` and rebuild image. | ECS automatically preserves existing healthy tasks. |
| 6 | **Health Check Fails** | ALB marks new containers unhealthy; deployment stalls. | `Health checks failed with these codes: [503] on /health/ready` | Database connection pool timeout or unhandled startup exception. | Fix connection timeout or startup dependency check logic. | Roll back to previous ECS task definition via automated CD step. |
| 7 | **Worker Cannot Start** | Queue depth grows indefinitely; reminders are delayed. | `pgrep -f "app.worker" returned 1: exit code 1` | Fatal syntax error or uncaught configuration error on worker entry. | Fix worker entrypoint script and verify locally with Docker Compose. | Revert worker ECS service to previous image tag. |
| 8 | **Frontend Wrong API URL** | Users see "Network Error" when attempting login or fetching tasks. | Browser Console: `POST http://localhost:8001/auth/login net::ERR_CONNECTION_REFUSED` | `VITE_API_URL` missing during build; defaulted to localhost. | Rebuild frontend passing `VITE_API_URL=https://api.example.com`. | Invalidate CloudFront cache after deploying corrected build. |
| 9 | **CORS Misconfiguration** | Browser blocks API responses for authenticated users. | `Access to fetch has been blocked by CORS policy: No 'Access-Control-Allow-Origin'` | `CORS_ORIGINS` does not match the frontend production domain. | Add `https://app.example.com` to `CORS_ORIGINS` in backend config. | Fast redeploy of backend configuration. |
| 10 | **Expired TLS / Domain Issue** | Browser displays warning `Your connection is not private (NET::ERR_CERT_DATE_INVALID)`. | Client SSL Handshake Failure. | ACM validation DNS CNAME deleted or certificate renewal failed. | Re-verify Route 53 DNS validation records in AWS Certificate Manager. | Switch DNS temporarily to backup CDN or renew certificate immediately. |
| 11 | **DB Connection Exhaustion** | API requests time out with HTTP 500; database unresponsive. | `TimeoutError: QueuePool limit of size 10 overflow 20 reached` | Task count scaled up without tuning `DB_POOL_SIZE`, exceeding RDS limit. | Decrease `DB_POOL_SIZE` per container or increase RDS instance class. | Scale down ECS task count temporarily to free connections. |
| 12 | **Broken Container Image** | Image pull fails during deployment; ECS cannot start task. | `CannotPullContainerError: ref pull has been killed: image not found` | Docker image tag mismatch between GitHub Actions and ECR repository. | Correct ECR repository name and image tag in deployment workflow. | ECS deployment cancels; existing running tasks remain operational. |

---

## Part 35 — Production Security Review Audit

An exhaustive security audit confirms full compliance with production standards:
- [x] **Zero Secrets in Repository**: `.gitignore` strictly protects `.env`, `.env.local`, `.pem`, and credentials.
- [x] **Safe Reference Configurations**: `.env.example` contains only structural placeholder keys with zero default passwords.
- [x] **No Hardcoded Credentials**: Database passwords, SMTP app passwords, and cryptographic keys are managed exclusively via environment variables and AWS Secrets Manager.
- [x] **No Public Exposure of Storage Layers**: PostgreSQL (Port 5432) and Redis (Port 6379) are bound strictly to private subnet security groups.
- [x] **No Frontend Privilege Escalation**: Registration APIs enforce `role = "USER"`. Administrative endpoints strictly reject non-admin tokens with HTTP 403 Forbidden.
- [x] **Least Privilege IAM**: Deployments utilize AWS OIDC identity federation with temporary session tokens rather than long-term IAM user access keys.

---

## Part 36 & 37 — CI/CD Failure Test & Deployment Versioning

### CI/CD Failure Gate Verification
- **Test**: Introduce an intentional assertion failure into a test file (e.g. `assert 1 == 2`).
- **Result**: GitHub Actions halts at the `backend-tests` step with exit code 1.
- **Enforcement**: The `deploy-production` job specifies `needs: pre-deployment-checks`, guaranteeing that a broken build **never** triggers container builds, database migrations, or ECS updates.

### Immutable Deployment Versioning
- Mutable tags like `:latest` are strictly prohibited in production task definitions.
- Every build produces immutable tags based on Semantic Versioning and Git commit SHA:
  - `productivity-backend:v1.0.0`
  - `productivity-backend:a1b2c3d`
- This ensures absolute reproducibility and instantaneous rollback to known-good binaries.

---

## Part 38 & 39 — Admin Operations & Production Real Email Verification

### Admin Portal Capabilities in Production
The Admin Portal (`/admin`) provides full operational control:
- Real-time Redis queue length monitoring (`queue:notifications`, `queue:processing`, `queue:dead_letter`).
- System health diagnostics (PostgreSQL connection pool utilization, Redis round-trip latency).
- Failure simulation lab for training and resilience verification.
- Dead-letter queue inspection with atomic job retry capabilities.
- Audit logs capturing all administrative actions with IP address and timestamps.

### Production Email Verification
- Outbound verification, password reset, and reminder emails are delivered via real SMTP using `nodemailer` (Node.js) or Python SMTP with TLS encryption.
- In-transit credentials are encrypted via STARTTLS on port 587.

---

## Part 40 — Final End-to-End Production Request Flow

```text
User Request
  │
  ▼
Route 53 DNS Resolution (api.example.com)
  │
  ▼
AWS Application Load Balancer (ALB)
  │ (Terminates TLS via ACM; checks Target Group health on /health/ready)
  ▼
ECS Fargate Task (Port 8001 - FastAPI / Express API)
  │ (Validates JWT, enforces RBAC, reads/writes PostgreSQL RDS)
  ▼
PostgreSQL RDS (Stores Activities & Reminders via ACID transactions)
  │
  ▼ (Scheduler detects due reminder with SELECT ... FOR UPDATE SKIP LOCKED)
Redis Queue (Enqueues job to 'queue:notifications')
  │
  ▼ (Atomic RPOPLPUSH into 'queue:processing')
ECS Fargate Worker Task
  │ (Verifies activity not COMPLETED; checks user quiet hours & timezone)
  ▼
Google Gmail SMTP Relay (Port 587 TLS)
  │
  ▼
User Inbox (Delivered real notification email)
```

---

## Monthly Infrastructure Cost Estimates (AWS US-East-1)

| Category | Component | Specification | Estimated Monthly Cost |
|---|---|---|---|
| **Compute** | ECS Fargate (API Service) | 2 tasks × 0.5 vCPU, 1 GB RAM (24/7) | ~$30.00 |
| **Compute** | ECS Fargate (Worker Service) | 1 task × 0.5 vCPU, 1 GB RAM (24/7) | ~$15.00 |
| **Networking** | Application Load Balancer (ALB) | 1 ALB + LCU usage | ~$22.00 |
| **Networking** | NAT Gateway | 1 NAT Gateway + 50 GB data processed | ~$35.00 |
| **Database** | Amazon RDS PostgreSQL | `db.t4g.small` (Multi-AZ, 50 GB gp3 SSD) | ~$55.00 |
| **Cache / Queue** | Amazon ElastiCache for Redis | `cache.t4g.micro` (1 node) | ~$13.00 |
| **Storage / CDN** | Amazon S3 & CloudFront | 10 GB storage, 50 GB egress | ~$5.00 |
| **Management** | Secrets Manager & Route 53 | 2 hosted zones, 5 secrets | ~$3.50 |
| **Observability** | CloudWatch Logs & Metrics | 10 GB log ingestion + 5 alarms | ~$7.00 |
| **Total** | **Full Production Environment** | **High-Availability Multi-AZ Architecture** | **~$185.50 / month** |

*(Note: In development/staging or on platforms like Render, costs can be reduced to $15–$35/month by using single-node shared tiers).*
