# SPEC-6: Non-Functional Requirements

## Project: Enterprise AI-Driven Upskilling & Mentorship Platform

This document outlines performance, security, scalability, and other non-functional requirements.

---

## 1. Performance Requirements

### 1.1 Page Load Times
| Metric | Target | Critical Threshold |
|--------|--------|---------------------|
| Initial page load | < 2 seconds | < 4 seconds |
| Time to Interactive (TTI) | < 3 seconds | < 5 seconds |
| Largest Contentful Paint | < 2.5 seconds | < 4 seconds |

### 1.2 API Response Times
| Endpoint Type | Target | Critical Threshold |
|---------------|--------|---------------------|
| Simple CRUD | < 200ms | < 500ms |
| Complex queries | < 500ms | < 1 second |
| Search/Filtering | < 500ms | < 1 second |

### 1.3 AI Response Times
| Operation | Target | Critical Threshold |
|-----------|--------|---------------------|
| First token (AI chat) | < 1 second | < 3 seconds |
| Full AI response | < 5 seconds | < 10 seconds |
| Recommendations | < 2 seconds | < 5 seconds |

### 1.4 Real-time
| Feature | Target | Critical Threshold |
|---------|--------|---------------------|
| WebSocket connection | < 500ms | < 1 second |
| Notification delivery | < 1 second | < 3 seconds |
| Leaderboard updates | < 2 seconds | < 5 seconds |

---

## 2. Security Requirements

### 2.1 Authentication
- **Azure Entra ID (OIDC):** Enterprise users authenticate via OAuth2 authorization code flow
- **Local Email/Password:** Admin users authenticate with bcrypt-hashed credentials (cost factor 12)
- JWT tokens: 15-minute expiry (both auth methods produce same token format)
- Refresh tokens: 7-day expiry (stored in HTTP-only secure cookie)
- Password policy (local admin): minimum 8 characters, bcrypt hashed
- Rate limiting: 10 requests/minute per IP on auth endpoints
- **Setup endpoints rate limiting:** 5 requests/minute per IP (brute-force protection on setup key)
- **SETUP_SECRET_KEY:** Required env variable - MS1 fails fast if not set
- Admin login endpoint restricted to users with Admin role only

### 2.2 Authorization
- Role-based access control (RBAC) with 6 roles
- Permission checks on all protected endpoints
- Resource ownership validation (users can only access own resources)
- Admin-only endpoints protected by role middleware

### 2.3 Data Protection
- TLS 1.3 everywhere (HTTPS only)
- PostgreSQL encryption at rest
- Environment variables for all secrets
- No sensitive data in logs
- Input sanitization to prevent injection attacks
- Certificate private key stored only in `CERT_PRIVATE_KEY`
- Certificate public key stored only in `CERT_PUBLIC_KEY`
- Private key must never appear in logs, exceptions, API payloads, or HTML

### 2.3a Entra ID Sync Data Protection (NEW)
- **entraGroups JSONB field must NOT be exposed in any public API response** — internal sync data only
- Do not serialize entraGroups, managerEntraOid, lastEntraSync in user responses to API clients
- These fields are for RoleMappingEngine evaluation only
- EmailMismatch flag: must be resolved within 30 days (data hygiene policy)

### 2.4 AI Security
- Prompt injection prevention on user inputs
- Input length limits on AI chat (max 2000 characters)
- Output filtering for inappropriate content
- Request rate limiting on AI endpoints

### 2.5 Certificate Verification Security
- Public verification endpoint rate limit: `30 requests/minute per IP`
- `certificate_id` must be validated as a UUID before any DB lookup
- All certificate lookups must use parameterized queries
- RS256 signature verification required for every public verification request
- All verification attempts must be logged with certificate_id, IP, timestamp, and result

---

## 3. Scalability Requirements

### 3.1 User Capacity
| Metric | Target | Limit |
|--------|--------|-------|
| Concurrent users (per tenant) | 100-500 | 1000 |
| Total registered users | 1000+ | 10000 |
| Teams per tenant | 50+ | 200 |

### 3.2 Data Volume
| Entity | Expected | Maximum |
|--------|----------|---------|
| Users | 500 | 10000 |
| Courses | 100 | 1000 |
| Enrollments | 5000 | 50000 |
| Chat messages | 50000 | 200000 |

### 3.3 Microservices
- Each service can scale horizontally independently
- Database connection pooling via SQLAlchemy (max 100 connections per service)

---

## 4. Availability Requirements

### 4.1 Uptime Targets
| Environment | Target Uptime | Critical |
|-------------|---------------|----------|
| Production | 99.5% | 99% |
| Demo/Staging | 99% | 95% |

### 4.2 Deployment
- Zero-downtime deployments via rolling updates
- Health check endpoints on all services
- Graceful shutdown handling (30-second timeout)

### 4.3 Fallback Strategy
- Demo mode: Pre-defined AI responses without external APIs
- Local Docker backup for defense presentation
- Seeded database for offline operation

---

## 5. Reliability Requirements

### 5.1 Error Handling
- Global error boundary in frontend
- Custom error pages (404, 500)
- Retry logic for transient failures (max 3 retries)
- Circuit breaker for external services (GROQ, Azure Entra ID)

### 5.2 Logging
- Structured JSON logging (Python logging + structlog)
- Log levels: ERROR, WARN, INFO, DEBUG
- Correlation IDs for request tracing
- Log aggregation ready (compatible with cloud logging)

### 5.3 Monitoring
- Health check endpoints: `/health` on all services
- **setup_completed status check:** API Gateway validates on startup; if false, setup wizard required
- Metrics: response time, error rate, CPU, memory
- Alerting for critical failures (in production)

---

## 6. Usability Requirements

### 6.1 Accessibility
- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader compatible
- Color contrast ratios ≥ 4.5:1

### 6.2 Browser Support
| Browser | Minimum Version |
|---------|-----------------|
| Chrome | 90+ |
| Firefox | 88+ |
| Safari | 14+ |
| Edge | 90+ |

### 6.3 Mobile Responsiveness
- Fully responsive on tablet (640px+)
- Core functionality working on mobile (320px+)
- Touch-friendly tap targets (min 44px)

---

## 7. Code Quality Requirements

### 7.1 Testing
| Type | Target Coverage | Minimum |
|------|-----------------|---------|
| Unit tests | 80% | 60% |
| Integration tests | Critical paths | - |
| E2E tests | Key user flows | 5 scenarios |

### 7.2 Code Standards
- Python 3.12+ with type hints
- Black + isort + ruff for formatting and linting
- TypeScript strict mode for frontend
- Conventional commits
- No print() in production code (use logging)

### 7.3 Documentation
- API documentation (Swagger/OpenAPI)
- README for each microservice
- Inline code comments for complex logic
- Architecture decision records (ADRs)

---

## 8. Data Retention

| Data Type | Retention | Policy |
|-----------|-----------|--------|
| Chat messages | 1 year | Auto-archive after |
| XP transactions | Forever | Keep |
| User data | Account lifetime | Delete on request |
| Analytics | 2 years | Aggregate & archive |
| Logs | 30 days | Rotate & delete |

---

## 9. Compliance

- Single-tenant architecture (isolated database per enterprise)
- GDPR-ready (data export, deletion)
- Audit logging for admin actions

---

*Generated for PFE Project: Enterprise AI-Driven Upskilling & Mentorship Platform*
*Author: Aya Telmoudi | Supervisor: Hazem Raouafi*
