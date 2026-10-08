import { Router } from "express";
import { getDb } from "../db.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", verifyToken, requireRole("admin"), async (req, res) => {
  const db = await getDb();

  const [totalUsers, totalLawyers, totalHires, revenue] = await Promise.all([
    db.collection("user").countDocuments({ role: "user" }),
    db.collection("user").countDocuments({ role: "lawyer" }),
    db.collection("hires").countDocuments(),
    db.collection("transactions").aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]).toArray(),
  ]);

  res.json({
    totalUsers,
    totalLawyers,
    totalHires,
    totalRevenue: revenue[0]?.total || 0,
  });
});

export default router;