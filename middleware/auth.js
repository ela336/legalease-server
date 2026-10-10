import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";

let jwks;

export async function verifyToken(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Missing token" });

    jwks ??= createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));

    const { payload } = await jwtVerify(token, jwks);

    const db = await getDb();

    const conditions = [];
    if (payload.sub) {
      conditions.push({ id: payload.sub });
      if (ObjectId.isValid(payload.sub)) conditions.push({ _id: new ObjectId(payload.sub) });
    }
    if (payload.email) conditions.push({ email: payload.email });

    const user = conditions.length
      ? await db.collection("user").findOne({ $or: conditions })
      : null;

    if (!user) {
  const cols = (await db.listCollections().toArray()).map((c) => c.name);
  console.error("User lookup failed. DB:", db.databaseName, "| Collections:", cols, "| Email:", payload.email);
  return res.status(401).json({ message: "User not found" });
}

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      image: user.image || "",
      role: user.role || "user",
    };
    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};