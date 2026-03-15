import { Router } from 'express';
import { getAnchorRegistry, getAnchorVerifier } from '../../../../engine/src/anchoring';
import type { ArtifactType } from '../../../../engine/src/anchoring';

export const anchorRouter = Router();

// GET /v1/anchors — query by agent, type, limit
anchorRouter.get('/v1/anchors', async (req, res) => {
  try {
    const agentId = req.query.agent_passport_id as string;
    if (!agentId) return res.status(400).json({ success: false, error: 'Missing agent_passport_id query parameter' });
    const records = await getAnchorRegistry().getByAgent(agentId, {
      artifact_type: req.query.artifact_type as ArtifactType | undefined,
      limit: parseInt(req.query.limit as string || '50', 10),
    });
    return res.json({ success: true, data: records });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /v1/anchors/:anchor_id
anchorRouter.get('/v1/anchors/:anchor_id', async (req, res) => {
  try {
    const record = await getAnchorRegistry().getById(req.params.anchor_id);
    if (!record) return res.status(404).json({ success: false, error: 'Anchor not found' });
    return res.json({ success: true, data: record });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /v1/anchors/:anchor_id/lineage
anchorRouter.get('/v1/anchors/:anchor_id/lineage', async (req, res) => {
  try {
    const lineage = await getAnchorRegistry().getLineage(req.params.anchor_id);
    return res.json({ success: true, data: lineage });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /v1/anchors/:anchor_id/verify
anchorRouter.post('/v1/anchors/:anchor_id/verify', async (req, res) => {
  try {
    const result = await getAnchorVerifier().verify(req.params.anchor_id);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /v1/anchors/cid/:cid
anchorRouter.get('/v1/anchors/cid/:cid', async (req, res) => {
  try {
    const record = await getAnchorRegistry().getByCID(req.params.cid);
    if (!record) return res.status(404).json({ success: false, error: 'CID not found in registry' });
    return res.json({ success: true, data: record });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
