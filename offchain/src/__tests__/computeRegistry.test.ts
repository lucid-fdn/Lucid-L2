import request from 'supertest';
import express from 'express';
import { lucidLayerRouter } from '../../packages/gateway-lite/src/routes/core/lucidLayerRoutes';

describe('compute registry endpoints', () => {
  const app = express();
  app.use(express.json());
  app.use('/', lucidLayerRouter);

  test('heartbeat then health returns state', async () => {
    const compute_passport_id = 'passport_compute_test_12345';

    const hb = await request(app)
      .post('/v1/compute/nodes/heartbeat')
      .send({ compute_passport_id, status: 'healthy', queue_depth: 2 });

    expect(hb.status).toBe(200);
    expect(hb.body.success).toBe(true);

    const health = await request(app).get(`/v1/compute/nodes/${compute_passport_id}/health`);
    expect(health.status).toBe(200);
    expect(health.body.success).toBe(true);
    expect(health.body.state.compute_passport_id).toBe(compute_passport_id);
    expect(health.body.state.status).toBe('healthy');
  });
});
