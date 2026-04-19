import { Router } from "express";
import { z } from "zod";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { catalogStorage } from "../storage/catalogStorage.js";

export const adminRouter = Router();

adminRouter.use("/admin", authenticate, requireAdmin);

const ADMIN_SUBJECTS = ["CSCE", "CPEN", "ECEN"] as const;

const courseCreateSchema = z.object({
  department: z.union([
    z.object({ code: z.string(), name: z.string() }),
    z.string(),
  ]),
  primary_subject: z
    .string()
    .min(1)
    .transform((s) => s.toUpperCase())
    .refine((s) => (ADMIN_SUBJECTS as readonly string[]).includes(s), {
      message: `primary_subject must be one of ${ADMIN_SUBJECTS.join(", ")}`,
    }),
  primary_number: z.string().min(1),
  title: z.string().min(1),
  credits: z.union([
    z.number(),
    z.object({ min: z.number(), max: z.number() }),
  ]),
  codes: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
  description_raw: z.string().optional(),
  prereq_raw: z.string().optional(),
  prereq_courses: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
});

const courseUpdateSchema = courseCreateSchema.partial();

adminRouter.get("/admin/courses", async (req, res, next) => {
  try {
    let courses = await catalogStorage.getAllCourses();

    const search = (req.query.search as string || "").trim().toLowerCase();
    if (search) {
      courses = courses.filter((c: any) => {
        const code = `${c.primary_subject || ""} ${c.primary_number || ""}`.toLowerCase();
        const title = (c.title || "").toLowerCase();
        return code.includes(search) || title.includes(search);
      });
    }

    res.json({ courses, total: courses.length });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/admin/courses", async (req, res, next) => {
  try {
    const parsed = courseCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid course data", issues: parsed.error.issues });
    }

    const courseData = {
      ...parsed.data,
      codes: parsed.data.codes ?? [`${parsed.data.primary_subject} ${parsed.data.primary_number}`],
      aliases: parsed.data.aliases ?? [`${parsed.data.primary_subject} ${parsed.data.primary_number}`],
    };

    const created = await catalogStorage.addCourse(courseData);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/admin/courses/:courseId", async (req, res, next) => {
  try {
    const courseId = Number(req.params.courseId);
    if (Number.isNaN(courseId)) {
      return res.status(400).json({ error: "Invalid course ID" });
    }

    const parsed = courseUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid course data", issues: parsed.error.issues });
    }

    const updated = await catalogStorage.updateCourse(courseId, parsed.data as Record<string, unknown>);
    if (!updated) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/admin/courses/:courseId", async (req, res, next) => {
  try {
    const courseId = Number(req.params.courseId);
    if (Number.isNaN(courseId)) {
      return res.status(400).json({ error: "Invalid course ID" });
    }

    const deleted = await catalogStorage.deleteCourse(courseId);
    if (!deleted) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
