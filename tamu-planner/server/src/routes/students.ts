import { Router } from "express";

export const studentsRouter = Router();

// TODO: wire to DB + auth middleware
studentsRouter.get("/students/:id", (_req, res) => {
  res.status(501).json({ error: "Not implemented" });
});

// Save planner changes (draft -> committed)
studentsRouter.post("/students/:id/planner", (_req, res) => {
  res.status(501).json({ error: "Not implemented" });
});
