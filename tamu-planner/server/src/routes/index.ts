import { Router } from "express";
import { healthRouter } from "./health.js";
import { studentsRouter } from "./students.js";
import { storageRouter } from "./storage.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(studentsRouter);
apiRouter.use(storageRouter);
