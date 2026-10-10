import { Router } from "express";
import { getDb } from "../db.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", verifyToken, requireRole("admin"), async (req, res) => {
  const db = await getDb();

  const start = new Date();
  start.setMonth(start.getMonth() - 5);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const [totalUsers, totalLawyers, totalHires, revenue, hiresByStatus, monthly, categories] =
    await Promise.all([
      db.collection("user").countDocuments({ role: "user" }),
      db.collection("user").countDocuments({ role: "lawyer" }),
      db.collection("hires").countDocuments(),
      db.collection("transactions").aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]).toArray(),
      db.collection("hires").aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
      db
        .collection("transactions")
        .aggregate([
          { $match: { date: { $gte: start } } },
          {
            $group: {
              _id: { y: { $year: "$date" }, m: { $month: "$date" } },
              revenue: { $sum: "$amount" },
              payments: { $sum: 1 },
            },
          },
        ])
        .toArray(),
      db
        .collection("lawyers")
        .aggregate([
          { $group: { _id: "$specialization", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),
    ]);

  // always return the last 6 months, including months with no payments
  const monthlyRevenue = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const found = monthly.find((x) => x._id.y === d.getFullYear() && x._id.m === d.getMonth() + 1);
    monthlyRevenue.push({
      month: d.toLocaleString("en-US", { month: "short" }),
      revenue: found?.revenue || 0,
      payments: found?.payments || 0,
    });
  }

  const statusCount = (s) => hiresByStatus.find((x) => x._id === s)?.count || 0;

  res.json({
    totalUsers,
    totalLawyers,
    totalHires,
    totalRevenue: revenue[0]?.total || 0,
    hiresByStatus: [
      { name: "Pending", value: statusCount("pending") },
      { name: "Accepted", value: statusCount("accepted") },
      { name: "Rejected", value: statusCount("rejected") },
    ],
    monthlyRevenue,
    categories: categories.map((c) => ({ name: c._id, count: c.count })),
  });
});

export default router;