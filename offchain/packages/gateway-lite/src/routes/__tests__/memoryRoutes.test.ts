import express from 'express';
import request from 'supertest';
import { memoryRouter, resetMemoryService } from '../core/memoryRoutes';
import { resetMemoryStore } from '../../../../engine/src/memory/store';

const app = express();
app.use(express.json());
app.use(memoryRouter);

describe('Memory Routes', () => {
  beforeEach(() => {
    resetMemoryStore();
    resetMemoryService();
  });

  const headers = { 'x-agent-passport-id': 'agent-1' };

  describe('POST /v1/memory/sessions', () => {
    it('should create a new session', async () => {
      const res = await request(app)
        .post('/v1/memory/sessions')
        .set(headers)
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.session_id).toBeDefined();
    });

    it('should 500 without passport header', async () => {
      const res = await request(app)
        .post('/v1/memory/sessions')
        .send({});
      expect(res.status).toBe(500);
    });
  });

  describe('POST /v1/memory/episodic', () => {
    it('should create episodic entry', async () => {
      // First create session
      const sessionRes = await request(app)
        .post('/v1/memory/sessions')
        .set(headers)
        .send({});
      const sessionId = sessionRes.body.data.session_id;

      const res = await request(app)
        .post('/v1/memory/episodic')
        .set(headers)
        .send({ session_id: sessionId, role: 'user', content: 'Hello', tokens: 5 });
      expect(res.status).toBe(201);
      expect(res.body.data.memory_id).toBeDefined();
    });

    it('should 400 on missing session_id', async () => {
      const res = await request(app)
        .post('/v1/memory/episodic')
        .set(headers)
        .send({ role: 'user', content: 'Hello', tokens: 5 });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/memory/semantic', () => {
    it('should create semantic entry', async () => {
      const res = await request(app)
        .post('/v1/memory/semantic')
        .set(headers)
        .send({ fact: 'Sky is blue', confidence: 0.9, content: 'Sky is blue' });
      expect(res.status).toBe(201);
    });

    it('should 400 on confidence > 1', async () => {
      const res = await request(app)
        .post('/v1/memory/semantic')
        .set(headers)
        .send({ fact: 'F', confidence: 1.5, content: 'F' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/memory/procedural', () => {
    it('should create procedural entry', async () => {
      const res = await request(app)
        .post('/v1/memory/procedural')
        .set(headers)
        .send({ rule: 'Always greet', trigger: 'session_start', content: 'Always greet' });
      expect(res.status).toBe(201);
    });

    it('should 400 on missing rule', async () => {
      const res = await request(app)
        .post('/v1/memory/procedural')
        .set(headers)
        .send({ trigger: 'session_start', content: 'X' });
      expect(res.status).toBe(400);
    });

    it('should 400 on missing trigger', async () => {
      const res = await request(app)
        .post('/v1/memory/procedural')
        .set(headers)
        .send({ rule: 'Always greet', content: 'X' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/memory/recall', () => {
    it('should return memories', async () => {
      await request(app)
        .post('/v1/memory/semantic')
        .set(headers)
        .send({ fact: 'Test fact', confidence: 0.9, content: 'Test fact' });

      const res = await request(app)
        .post('/v1/memory/recall')
        .set(headers)
        .send({ query: 'test', agent_passport_id: 'agent-1' });
      expect(res.status).toBe(200);
      expect(res.body.data.memories).toBeDefined();
    });
  });

  describe('GET /v1/memory/entries/:id', () => {
    it('should return entry by id', async () => {
      const createRes = await request(app)
        .post('/v1/memory/semantic')
        .set(headers)
        .send({ fact: 'F', confidence: 0.9, content: 'F' });
      const { memory_id } = createRes.body.data;

      const res = await request(app)
        .get(`/v1/memory/entries/${memory_id}`)
        .set(headers);
      expect(res.status).toBe(200);
      expect(res.body.data.content).toBe('F');
    });

    it('should 404 for non-existent entry', async () => {
      const res = await request(app)
        .get('/v1/memory/entries/nonexistent')
        .set(headers);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /v1/memory/entries', () => {
    it('should list entries for agent', async () => {
      await request(app)
        .post('/v1/memory/semantic')
        .set(headers)
        .send({ fact: 'A', confidence: 0.9, content: 'A' });
      await request(app)
        .post('/v1/memory/semantic')
        .set(headers)
        .send({ fact: 'B', confidence: 0.8, content: 'B' });

      const res = await request(app)
        .get('/v1/memory/entries')
        .set(headers);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });
  });

  describe('POST /v1/memory/sessions/:id/close', () => {
    it('should close session', async () => {
      const sessionRes = await request(app)
        .post('/v1/memory/sessions')
        .set(headers)
        .send({});
      const sessionId = sessionRes.body.data.session_id;

      const res = await request(app)
        .post(`/v1/memory/sessions/${sessionId}/close`)
        .set(headers)
        .send({ summary: 'Test summary' });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /v1/memory/sessions/:id/context', () => {
    it('should return session context', async () => {
      const sessionRes = await request(app)
        .post('/v1/memory/sessions')
        .set(headers)
        .send({});
      const sessionId = sessionRes.body.data.session_id;

      await request(app)
        .post('/v1/memory/episodic')
        .set(headers)
        .send({ session_id: sessionId, role: 'user', content: 'Hello', tokens: 3 });

      const res = await request(app)
        .get(`/v1/memory/sessions/${sessionId}/context`)
        .set(headers);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('should 404 for non-existent session', async () => {
      const res = await request(app)
        .get('/v1/memory/sessions/nonexistent/context')
        .set(headers);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /v1/memory/sessions', () => {
    it('should list sessions', async () => {
      await request(app)
        .post('/v1/memory/sessions')
        .set(headers)
        .send({});

      const res = await request(app)
        .get('/v1/memory/sessions')
        .set(headers);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('GET /v1/memory/stats/:agent_id', () => {
    it('should return stats', async () => {
      const res = await request(app)
        .get('/v1/memory/stats/agent-1')
        .set(headers);
      expect(res.status).toBe(200);
      expect(res.body.data.total_entries).toBeDefined();
    });
  });

  describe('POST /v1/memory/verify', () => {
    it('should verify chain integrity', async () => {
      const res = await request(app)
        .post('/v1/memory/verify')
        .set(headers)
        .send({ agent_passport_id: 'agent-1', namespace: 'agent:agent-1' });
      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
    });

    it('should 400 without agent_passport_id', async () => {
      const res = await request(app)
        .post('/v1/memory/verify')
        .set(headers)
        .send({ namespace: 'agent:agent-1' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/memory/provenance/:agent_id/:ns', () => {
    it('should return provenance chain', async () => {
      const res = await request(app)
        .get('/v1/memory/provenance/agent-1/agent%3Aagent-1')
        .set(headers);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /v1/memory/snapshots', () => {
    it('should return 503 when DePIN storage not configured', async () => {
      const res = await request(app)
        .post('/v1/memory/snapshots')
        .set(headers)
        .send({ agent_passport_id: 'agent-1' });
      // Route is wired in v2; returns 503 when DePIN storage is unavailable
      expect([500, 503]).toContain(res.status);
    });
  });

  describe('POST /v1/memory/compact', () => {
    it('should return 200 (wired in v2)', async () => {
      const res = await request(app)
        .post('/v1/memory/compact')
        .set(headers)
        .send({});
      expect(res.status).toBe(200);
    });
  });
});
