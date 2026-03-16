// Copyright 2024-2026 Raijin Labs. Licensed under AGPL-3.0 — see LICENSE in this package.
// middleware.ts — Express middleware setup (helmet, CORS, rate limiting, body parsing, OpenAPI, Swagger)

import express, { Express } from 'express';
import helmet from 'helmet';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { PATHS } from '../../engine/src/shared/config/paths';

/**
 * Per-agent rate limiter — keyed by X-Agent-Passport-Id header instead of IP.
 * Used for memory and anchor routes to prevent single-agent abuse.
 */
export const agentRateLimit = rateLimit({
  windowMs: 60000,
  max: 100, // 100 req/min per agent
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-agent-passport-id'] as string || req.ip || 'unknown',
  message: { success: false, error: 'Agent rate limit exceeded' },
});

/**
 * Apply all middleware to the Express app.
 * Must be called before route mounting.
 */
export function applyMiddleware(app: Express): void {
  // Security headers (OWASP best practice)
  app.use(helmet({
    contentSecurityPolicy: false, // CSP disabled — API-only server, no HTML to protect
  }));

  // Global rate limiting (per IP)
  const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 minute
  const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '200', 10); // 200 req/min per IP
  app.use(rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    standardHeaders: true, // Return RateLimit-* headers (draft-6)
    legacyHeaders: false,  // Disable X-RateLimit-* headers
    message: { success: false, error: 'Too many requests, please try again later' },
    keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] as string || 'unknown',
  }));

  // Stricter rate limit for inference endpoint (expensive operation)
  const INFERENCE_RATE_LIMIT_MAX = parseInt(process.env.INFERENCE_RATE_LIMIT_MAX || '30', 10);
  app.use('/v1/chat/completions', rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: INFERENCE_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Inference rate limit exceeded' },
    keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] as string || 'unknown',
  }));

  // Per-agent rate limiting for memory and anchor routes
  app.use('/v1/memory', agentRateLimit);
  app.use('/v1/anchors', agentRateLimit);

  // Body size limit — prevent OOM from oversized payloads
  const BODY_LIMIT = process.env.BODY_SIZE_LIMIT || '5mb';
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

  // CORS — restrict to known origins (env-configurable)
  const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(',').map(o => o.trim());

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Payment-Proof');
    // Allow Chrome private network access preflight from secure pages
    res.header('Access-Control-Allow-Private-Network', 'true');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }

    next();
  });

  // -------------------------------------------------------------------------
  // OpenAPI / Swagger UI
  // -------------------------------------------------------------------------

  // Serve raw OpenAPI spec
  app.get('/api/openapi.yaml', (_req, res) => {
    try {
      const specPath = PATHS.OPENAPI_SPEC;
      const yaml = fs.readFileSync(specPath, 'utf8');
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.send(yaml);
    } catch (err) {
      console.error('Failed to read openapi.yaml:', err);
      res.status(500).json({ success: false, error: 'Failed to load OpenAPI spec' });
    }
  });

  // Swagger UI (loads the spec via URL so we don't need a YAML parser at runtime)
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      swaggerOptions: {
        url: '/api/openapi.yaml',
      },
    })
  );

  // -------------------------------------------------------------------------
  // OpenAPI request validation
  // -------------------------------------------------------------------------
  (async () => {
    try {
      const specPath = PATHS.OPENAPI_SPEC;
      const yamlContent = fs.readFileSync(specPath, 'utf8');
      const yamlModule = await import('yaml');
      const apiSpec = yamlModule.parse(yamlContent);

      const OpenApiValidator = await import('express-openapi-validator');
      app.use(
        OpenApiValidator.middleware({
          apiSpec,
          validateRequests: true,
          validateResponses: false,
          validateApiSpec: true,
          ignorePaths: /^(\/api\/|\/v1\/memory|\/v1\/anchors)/,
        })
      );
    } catch (err) {
      console.warn('OpenAPI validator disabled (failed to load/parse openapi.yaml):', err);
    }
  })();

  // Serve static assets from auth-frontend build
  app.use('/api/wallets/auth/assets', express.static(path.join(PATHS.AUTH_FRONTEND_DIST, 'assets')));
}
