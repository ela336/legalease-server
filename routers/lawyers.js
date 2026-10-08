import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = Router();
const lawyers = async () => (await getDb()).collection("lawyers");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const validId = (id) => ObjectId.isValid(id);


router.get("/", async (req, res) => {
  const { search, category, minFee, maxFee, available, sort = "newest" } = req.query;
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 8, 1), 12);

  const filter = { published: true };

  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: rx }, { specialization: rx }];
  }
  if (category) filter.specialization = new RegExp(`^${escapeRegex(category)}$`, "i");
  if (minFee || maxFee) {
    filter.fee = {};
    if (minFee) filter.fee.$gte = Number(minFee);
    if (maxFee) filter.fee.$lte = Number(maxFee);
  }
  if (available === "true") filter.status = "available";

  const sortMap = {
    newest: { createdAt: -1 },
    "fee-asc": { fee: 1 },
    "fee-desc": { fee: -1 },
    popular: { hireCount: -1 },
  };

  const col = await lawyers();
  const total = await col.countDocuments(filter);
  const items = await col
    .find(filter)
    .sort(sortMap[sort] || sortMap.newest)
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();

  res.json({ lawyers: items, total, page, pages: Math.ceil(total / limit) });
});

// Home page: latest 6
router.get("/featured", async (req, res) => {
  const col = await lawyers();
  const items = await col.find({ published: true }).sort({ createdAt: -1 }).limit(6).toArray();
  res.json(items);
});

// Home page: top 3 by hires
router.get("/top", async (req, res) => {
  const col = await lawyers();
  const items = await col
    .find({ published: true })
    .sort({ hireCount: -1, createdAt: -1 })
    .limit(3)
    .toArray();
  res.json(items);
});

// Lawyer dashboard: own listings
router.get("/mine", verifyToken, requireRole("lawyer"), async (req, res) => {
  const col = await lawyers();
  res.json(await col.find({ ownerEmail: req.user.email }).sort({ createdAt: -1 }).toArray());
});

// Admin: all listings
router.get("/admin/all", verifyToken, requireRole("admin"), async (req, res) => {
  const col = await lawyers();
  res.json(await col.find().sort({ createdAt: -1 }).toArray());
});

// Details (public)
router.get("/:id", async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ message: "Lawyer not found" });
  const col = await lawyers();
  const lawyer = await col.findOne({ _id: new ObjectId(req.params.id) });
  if (!lawyer) return res.status(404).json({ message: "Lawyer not found" });
  res.json(lawyer);
});

// Create (lawyer)
router.post("/", verifyToken, requireRole("lawyer"), async (req, res) => {
  const { name, bio, fee, specialization, image } = req.body;
  if (!name || !bio || !fee || !specialization) {
    return res.status(400).json({ message: "Name, bio, fee and specialization are required" });
  }

  const doc = {
    name: String(name).trim(),
    bio: String(bio).trim(),
    fee: Number(fee),
    specialization: String(specialization).trim(),
    image: image || "",
    status: "available",
    published: true,
    hireCount: 0,
    ownerEmail: req.user.email,
    createdAt: new Date(),
  };

  const col = await lawyers();
  const result = await col.insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
});

// Update (owner or admin)
router.patch("/:id", verifyToken, requireRole("lawyer", "admin"), async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ message: "Lawyer not found" });
  const col = await lawyers();
  const _id = new ObjectId(req.params.id);
  const existing = await col.findOne({ _id });
  if (!existing) return res.status(404).json({ message: "Lawyer not found" });

  const isOwner = existing.ownerEmail === req.user.email;
  if (!isOwner && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const allowed = isOwner
    ? ["name", "bio", "fee", "specialization", "image", "status", "published"]
    : ["published"]; // admin can only publish / unpublish
  const update = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  }
  if (update.fee !== undefined) update.fee = Number(update.fee);

  await col.updateOne({ _id }, { $set: update });
  res.json({ ...existing, ...update });
});

// Delete (owner or admin)
router.delete("/:id", verifyToken, requireRole("lawyer", "admin"), async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ message: "Lawyer not found" });
  const col = await lawyers();
  const _id = new ObjectId(req.params.id);
  const existing = await col.findOne({ _id });
  if (!existing) return res.status(404).json({ message: "Lawyer not found" });

  if (existing.ownerEmail !== req.user.email && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  await col.deleteOne({ _id });
  res.json({ message: "Deleted" });
});

export default router;