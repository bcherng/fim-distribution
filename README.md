# FIM-Distribution v1.1.0

Distribution and monitoring hub for the FIM system. Provides a graphical dashboard and secure API infrastructure for integrity auditing.

## About The Project

FIM-Distribution is the server-side component of the Distributed File Integrity Monitoring System. In v1.1.0, the backend has been hardened with enterprise-grade security to authenticate and protect distributed monitoring data.

Key Infrastructure Upgrades:
- **Asymmetric Signature Verification**: Every event report and heartbeat from monitored machines is verified using RSA-2048 signatures before being accepted.
- **Server-Side Hardening**: Implemented rate-limiting, brute-force protection, and strict security headers.
- **API Integrity**: All payloads are validated against strict Zod schemas, and responses are cryptographically signed by the server.

## Features

*   **Graphical Dashboard**: Real-time visualization of machine health and file integrity logs.
*   **Hardened API Architecture**:
    - **Rate Limiting**: Tiered limits for global and authentication routes.
    - **Brute Force Protection**: Progressive delays on failed admin login attempts.
    - **Message Signing**: Every server response is signed by a hardware-bound RSA key.
*   **Baseline Management**: Manage and approve file updates for registered machines.

## Built With

*   Node.js (Express)
*   PostgreSQL (Vercel Postgres)
*   Zod (Schema Validation)
*   Helmet (Security Headers)

## Usage
The web application is automatically built and deployed at [https://fim-distribution.vercel.app/](https://fim-distribution.vercel.app/). Daemons can be downloaded and registered directly through the portal.
