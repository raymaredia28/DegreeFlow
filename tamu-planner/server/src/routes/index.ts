import { Router } from "express";
import { adminRouter } from "./admin.js";
import { catalogRouter } from "./catalog.js";
import { chatRouter } from "./chat.js";
import { healthRouter } from "./health.js";
import { storageRouter } from "./storage.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(storageRouter);
apiRouter.use(chatRouter);
apiRouter.use(catalogRouter);
apiRouter.use(adminRouter);
