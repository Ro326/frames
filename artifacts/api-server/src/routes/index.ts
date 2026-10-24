import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { accountRouter } from "./account";
import { projectsRouter } from "./projects";
import { directorRouter } from "./director";
import { checkerRouter } from "./checker";
import { adminRouter } from "./admin";
import { servicesRouter } from "./services";
import rateLimit from "express-rate-limit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));
router.use(accountRouter);
const aiLimit = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false });
router.use("/projects/:id/direct", aiLimit);
router.use("/projects/:id/check", aiLimit);
router.use("/projects/:id/voiceover", aiLimit);
router.use(projectsRouter);
router.use(directorRouter);
router.use(checkerRouter);
router.use(servicesRouter);

export default router;
