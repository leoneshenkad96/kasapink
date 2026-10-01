import { Router, type IRouter } from "express";
import erpRouter from "./erp";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(erpRouter);

export default router;
