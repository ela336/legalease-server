import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(verifyToken, requireRole("admin"));

router.get("/", async (req, res) => {
  const db = await getDb();
  const users = await db
    .collection("user")
    .find({}, { projection: { name: 1, email: 1, role: 1, image: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(users);
});

router.patch("/:id/role", async (req, res) => {
  const { role } = req.body;
  if (!["user", "lawyer", "admin"].includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "User not found" });
  if (req.params.id === req.user.id) {
    return res.status(400).json({ message: "You cannot change your own role" });
  }

  const db = await getDb();
  const result = await db.collection("user").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { role } });
  if (!result.matchedCount) return res.status(404).json({ message: "User not found" });
  res.json({ message: "Role updated" });
});

router.delete("/:id", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "User not found" });
  if (req.params.id === req.user.id) {
    return res.status(400).json({ message: "You cannot delete yourself" });
  }

  const db = await getDb();
  const _id = new ObjectId(req.params.id);
  const result = await db.collection("user").deleteOne({ _id });
  if (!result.deletedCount) return res.status(404).json({ message: "User not found" });

  // clean up login sessions and linked accounts so the user is fully removed
  const ids = [_id, req.params.id];
  await db.collection("session").deleteMany({ userId: { $in: ids } });
  await db.collection("account").deleteMany({ userId: { $in: ids } });
  res.json({ message: "User deleted" });
});

export default router;