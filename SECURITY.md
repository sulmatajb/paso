# Security model

Hosted Paso uses Sites authentication. Every user-data route obtains identity server-side and binds SQL parameters to that user ID. Client payloads cannot choose an owner. Mutations require a same-origin request and an application header; no cross-origin API access is enabled. Responses containing account or progress data are private and non-cacheable. The service worker never intercepts account, sync, inference, or authentication routes.

The standalone built Worker assumes its identity headers have been set by a trusted, authenticated dispatch layer. Never expose it directly to untrusted traffic without stripping incoming identity headers and verifying authentication first. The development sign-in helper only accepts loopback requests and is excluded from production builds.

Inference URLs and bearer secrets belong in server runtime configuration. Clients cannot choose arbitrary upstream URLs. Hosted model requests have input limits, request timeouts, and a per-account quota. The optional inference containers bind localhost ports and require a bearer secret. Put them behind an HTTPS gateway before connecting a remote Paso deployment. Review and patch pinned dependencies before a public deployment.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/sulmatajb/paso/security/advisories/new). Include affected version/commit, impact, a minimal reproduction, and any proposed mitigation. Use synthetic data; never include real credentials or learner records. Do not post an unpatched vulnerability in public issues.

Security fixes target the current `main` branch and latest beta; older snapshots are not separately maintained. Maintainers will assess reports as capacity permits; no response-time guarantee is offered. This project has not undergone an independent security audit.
