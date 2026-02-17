import { Router } from "express";
import { catalogRouter } from "./catalog.js";
import { chatRouter } from "./chat.js";
import { healthRouter } from "./health.js";
import { studentsRouter } from "./students.js";
import { storageRouter } from "./storage.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(studentsRouter);
apiRouter.use(storageRouter);
apiRouter.use(chatRouter);
apiRouter.use(catalogRouter);
