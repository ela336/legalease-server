import { Router } from "express";
import Stripe from "stripe";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = Router();
const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY);

// Client clicks Pay: create a Stripe Checkout session
router.post("/create-checkout-session", verifyToken, requireRole("user"), async (req, res) => {
  const { hireId } = req.body;
  if (!ObjectId.isValid(hireId)) return res.status(400).json({ message: "Invalid request" });

  const db = await getDb();
  const hire = await db.collection("hires").findOne({
    _id: new ObjectId(hireId),
    userEmail: req.user.email,
  });

  if (!hire) return res.status(404).json({ message: "Hiring request not found" });
  if (hire.status !== "accepted") {
    return res.status(400).json({ message: "You can pay only after the lawyer accepts your request" });
  }
  if (hire.paid) return res.status(400).json({ message: "This request is already paid" });

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer_email: req.user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(hire.fee * 100),
          product_data: {
            name: `Legal consultation with ${hire.lawyerName}`,
            description: hire.specialization,
          },
        },
      },
    ],
    metadata: { hireId: hire._id.toString() },
    success_url: `${process.env.CLIENT_URL}/dashboard/user/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_URL}/dashboard/user/hiring-history`,
  });

  res.json({ url: session.url });
});

// Success page: verify the payment with Stripe, then mark paid and save the transaction
router.post("/confirm", verifyToken, requireRole("user"), async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ message: "Missing session id" });

  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") {
    return res.status(400).json({ message: "Payment has not been completed" });
  }

  const hireId = session.metadata?.hireId;
  if (!ObjectId.isValid(hireId)) return res.status(400).json({ message: "Invalid payment session" });

  const db = await getDb();
  const hire = await db.collection("hires").findOne({
    _id: new ObjectId(hireId),
    userEmail: req.user.email, // a user can only confirm their own payment
  });
  if (!hire) return res.status(404).json({ message: "Hiring request not found" });

  const transactionId = session.payment_intent || session.id;

  // upsert makes this safe to call twice (page refresh, double click)
  await db.collection("transactions").updateOne(
    { transactionId },
    {
      $setOnInsert: {
        transactionId,
        hireId: hire._id,
        userEmail: hire.userEmail,
        userName: hire.userName,
        lawyerEmail: hire.lawyerEmail,
        lawyerName: hire.lawyerName,
        amount: session.amount_total / 100,
        date: new Date(),
      },
    },
    { upsert: true }
  );

  if (!hire.paid) {
    await db.collection("hires").updateOne(
      { _id: hire._id },
      { $set: { paid: true, paidAt: new Date(), transactionId } }
    );
  }

  res.json({
    message: "Payment confirmed",
    transactionId,
    amount: session.amount_total / 100,
    lawyerName: hire.lawyerName,
  });
});

// Transaction history: admin sees all, users and lawyers see their own
router.get("/transactions", verifyToken, async (req, res) => {
  const db = await getDb();
  let filter = {};
  if (req.user.role === "user") filter = { userEmail: req.user.email };
  else if (req.user.role === "lawyer") filter = { lawyerEmail: req.user.email };

  res.json(await db.collection("transactions").find(filter).sort({ date: -1 }).toArray());
});

export default router;