import { Router } from 'express';
import * as dealsController from '../controllers/deals.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { workspaceContext } from '../middleware/workspaceContext.js';
import { authorize } from '../middleware/authorize.js';
import { validate, dealSchemas } from '../validators/index.js';

const router = Router({ mergeParams: true });

router.use(authenticate, workspaceContext);

router.get('/', dealsController.list);
router.post('/', authorize('CLIENT'), validate({ body: dealSchemas.create }), dealsController.create);
router.get('/:id', dealsController.get);
router.patch('/:id', authorize('CLIENT'), validate({ body: dealSchemas.update }), dealsController.update);
router.patch('/:id/stage', authorize('CLIENT'), validate({ body: dealSchemas.stageUpdate }), dealsController.updateStage);
router.delete('/:id', authorize('CLIENT'), dealsController.remove);

export default router;
