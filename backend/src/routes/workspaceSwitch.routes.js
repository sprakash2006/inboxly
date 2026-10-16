import { Router } from 'express';
import * as authService from '../services/auth.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { workspaceContext } from '../middleware/workspaceContext.js';
import { setAuthCookies } from '../lib/authCookies.js';

// Mounted at /workspaces/:workspaceId/switch — workspaceContext already
// verifies the caller is a member of :workspaceId (and blocks suspended /
// billing-inactive workspaces, same as any other action there).
const router = Router({ mergeParams: true });
router.use(authenticate, workspaceContext);

router.post('/', async (req, res) => {
  const result = await authService.switchWorkspace(req.user.id, req.params.workspaceId);
  setAuthCookies(res, result);
  res.json(result);
});

export default router;
