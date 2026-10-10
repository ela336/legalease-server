import "dotenv/config";
import express from "express";
import cors from "cors";

import lawyersRoutes from "./routes/lawyers.js";
import hiresRoutes from "./routes/hires.js";
import commentsRoutes from "./routes/comments.js";
import usersRoutes from "./routes/users.js";
import statsRoutes from "./routes/stats.js";
import paymentsRoutes from "./routes/payments.js";   // <- new import

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

app.get("/", (req, res) => res.json({ message: "LegalEase API is running" }));

app.use("/api/lawyers", lawyersRoutes);
app.use("/api/hires", hiresRoutes);
app.use("/api/comments", commentsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/payments", paymentsRoutes);            // <- new route

app.use((req, res) => res.status(404).json({ message: "Route not found" }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

if (!process.env.VERCEL) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`Server running on port ${port}`));
}

export default app;