import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = Router();

// User sends a hiring request
router.post("/", verifyToken, requireRole("user"), async (req, res) => {
  const { lawyerId } = req.body;
  if (!ObjectId.isValid(lawyerId)) return res.status(400).json({ message: "Invalid lawyer" });

  const db = await getDb();
  const lawyer = await db.collection("lawyers").findOne({ _id: new ObjectId(lawyerId) });
  if (!lawyer || !lawyer.published) return res.status(404).json({ message: "Lawyer not found" });
  if (lawyer.status === "busy") return res.status(400).json({ message: "This lawyer is currently busy" });

  const duplicate = await db.collection("hires").findOne({
    lawyerId: lawyer._id,
    userEmail: req.user.email,
    status: { $in: ["pending", "accepted"] },
  });
  if (duplicate) {
    return res.status(409).json({ message: "You already have an active request with this lawyer" });
  }

  const doc = {
    lawyerId: lawyer._id,
    lawyerName: lawyer.name,
    lawyerEmail: lawyer.ownerEmail,
    specialization: lawyer.specialization,
    fee: lawyer.fee,
    userEmail: req.user.email,
    userName: req.user.name,
    status: "pending",
    paid: false,
    createdAt: new Date(),
  };
  const result = await db.collection("hires").insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
});

// User: own hiring history
router.get("/mine", verifyToken, requireRole("user"), async (req, res) => {
  const db = await getDb();
  res.json(await db.collection("hires").find({ userEmail: req.user.email }).sort({ createdAt: -1 }).toArray());
});

// Lawyer: requests received
router.get("/received", verifyToken, requireRole("lawyer"), async (req, res) => {
  const db = await getDb();
  res.json(await db.collection("hires").find({ lawyerEmail: req.user.email }).sort({ createdAt: -1 }).toArray());
});

// Lawyer: accept or reject
router.patch("/:id/status", verifyToken, requireRole("lawyer"), async (req, res) => {
  const { status } = req.body;
  if (!["accepted", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Status must be accepted or rejected" });
  }
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "Request not found" });

  const db = await getDb();
  const hire = await db.collection("hires").findOne({
    _id: new ObjectId(req.params.id),
    lawyerEmail: req.user.email,
  });
  if (!hire) return res.status(404).json({ message: "Request not found" });
  if (hire.status !== "pending") return res.status(400).json({ message: "Request already handled" });

  await db.collection("hires").updateOne({ _id: hire._id }, { $set: { status } });
  if (status === "accepted") {
    await db.collection("lawyers").updateOne({ _id: hire.lawyerId }, { $inc: { hireCount: 1 } });
  }
  res.json({ ...hire, status });
});

export default router;