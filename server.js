require("dotenv").config();
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { ethers } = require("ethers");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

const TREASURY_ADDRESS = "0x4D4F4135757fAef9eFbB3a959A58CD01c0beCa4D";

app.use("/webhook", express.raw({ type: "application/json" }));
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "FlowPay server running" });
});

// Create onramp session — customer pays card, Stripe converts to USDC
// USDC lands directly in the treasury wallet
app.post("/create-onramp", async (req, res) => {
  try {
    const { amount, treasuryAddress = TREASURY_ADDRESS } = req.body;

    const session = await stripe.crypto.onrampSessions.create({
      transaction_details: {
        destination_currency: "usdc",
        destination_network: "arbitrum",
        destination_amount: amount.toString(),
        lock_wallet_address: true,
        wallet_address: treasuryAddress,
      },
      customer_ip_address: req.ip,
    });

    console.log("Onramp session created:", session.id);
    console.log("Redirect URL:", session.redirect_url);
    console.log("Wallet:", treasuryAddress);
    console.log("Amount:", amount, "USDC");

    res.json({
      redirect_url: session.redirect_url,
      session_id: session.id,
      client_secret: session.client_secret,
    });
  } catch (err) {
    console.error("Onramp session error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Webhook — fires when onramp transaction completes
app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("Event received:", event.type);

  if (event.type === "crypto.onramp_session.updated") {
    const session = event.data.object;
    console.log("Onramp status:", session.status);
    if (session.status === "fulfillment_complete") {
      console.log("USDC delivered to treasury:", session.transaction_details.wallet_address);
      console.log("Amount:", session.transaction_details.destination_amount, "USDC");
    }
  }

  res.json({ received: true });
});

app.listen(PORT, () => {
  console.log("FlowPay Server running on port", PORT);
});