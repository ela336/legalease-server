import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = Router();

// Public: comments on a lawyer
router.get("/lawyer/:lawyerId", async (req, res) => {
  if (!ObjectId.isValid(req.params.lawyerId)) return res.json([]);
  const db = await getDb();
  res.json(
    await db
      .collection("comments")
      .find({ lawyerId: new ObjectId(req.params.lawyerId) })
      .sort({ createdAt: -1 })
      .toArray()
  );
});

// Can the logged-in user comment? (used to show/hide the form)
router.get("/can-comment/:lawyerId", verifyToken, async (req, res) => {
  if (req.user.role !== "user" || !ObjectId.isValid(req.params.lawyerId)) {
    return res.json({ allowed: false });
  }
  const db = await getDb();
  const hire = await db.collection("hires").findOne({
    lawyerId: new ObjectId(req.params.lawyerId),
    userEmail: req.user.email,
    status: "accepted",
  });
  res.json({ allowed: !!hire });
});

// Add comment (hire record required)
router.post("/", verifyToken, requireRole("user"), async (req, res) => {
  const { lawyerId, text } = req.body;
  if (!ObjectId.isValid(lawyerId) || !text?.trim()) {
    return res.status(400).json({ message: "Lawyer and comment text are required" });
  }

  const db = await getDb();
  const hire = await db.collection("hires").findOne({
    lawyerId: new ObjectId(lawyerId),
    userEmail: req.user.email,
    status: "accepted",
  });
  if (!hire) {
    return res.status(403).json({ message: "Only users who have hired this lawyer can comment" });
  }

  const lawyer = await db.collection("lawyers").findOne({ _id: new ObjectId(lawyerId) });
  const doc = {
    lawyerId: new ObjectId(lawyerId),
    lawyerName: lawyer?.name || "",
    userEmail: req.user.email,
    userName: req.user.name,
    userImage: req.user.image,
    text: text.trim(),
    createdAt: new Date(),
  };
  const result = await db.collection("comments").insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
});

// My comments
router.get("/mine", verifyToken, requireRole("user"), async (req, res) => {
  const db = await getDb();
  res.json(await db.collection("comments").find({ userEmail: req.user.email }).sort({ createdAt: -1 }).toArray());
});

// Edit own comment
router.patch("/:id", verifyToken, requireRole("user"), async (req, res) => {
  const { text } = req.body;
  if (!ObjectId.isValid(req.params.id) || !text?.trim()) {
    return res.status(400).json({ message: "Comment text is required" });
  }
  const db = await getDb();
  const result = await db
    .collection("comments")
    .updateOne({ _id: new ObjectId(req.params.id), userEmail: req.user.email }, { $set: { text: text.trim(), updatedAt: new Date() } });
  if (!result.matchedCount) return res.status(404).json({ message: "Comment not found" });
  res.json({ message: "Updated" });
});

// Delete own comment
router.delete("/:id", verifyToken, requireRole("user"), async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "Comment not found" });
  const db = await getDb();
  const result = await db
    .collection("comments")
    .deleteOne({ _id: new ObjectId(req.params.id), userEmail: req.user.email });
  if (!result.deletedCount) return res.status(404).json({ message: "Comment not found" });
  res.json({ message: "Deleted" });
});

export default router;