import { Router } from "express";
import { Keypair } from "@stellar/stellar-sdk";
import { analyzeRemittanceHistory } from "../services/stellar.js";
import { validateVerificationBody } from "../middleware/validate.js";
import { calculateCreditScore } from "../services/scoring.js";
import { validateVerificationBody, validateWalletAddress } from "../middleware/validate.js";
import { createChallenge, consumeChallenge } from "../services/challengeStore.js";

export const verificationRouter = Router();

/**
 * @openapi
 * /api/verification/check:
 *   post:
 *     summary: Analyze remittance payment history
 *     description: Accepts a Stellar sender wallet and recipient address, queries Horizon for outgoing USDC payments, and returns a remittance eligibility summary.
 *     tags:
 *       - Verification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerificationCheckRequest'
 *           examples:
 *             check:
 *               value:
 *                 senderAddress: GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF
 *                 recipientAddress: GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBCJ
 *     responses:
 *       200:
 *         description: Remittance analysis completed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RemittanceAnalysis'
 *       400:
 *         description: Required request fields are missing.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Verification service failed unexpectedly.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
verificationRouter.post("/check", validateVerificationBody, async (req, res) => {
  try {
    const { senderAddress, recipientAddress } = req.body;

    // Validation middleware ensures inputs are present and valid

    const result = await analyzeRemittanceHistory(
      senderAddress,
      recipientAddress
    );

    res.json(result);
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ error: "Verification service failed" });
  }
});

/**
 * @openapi
 * /api/verification/score:
 *   post:
 *     summary: Calculate borrower credit score
 *     description: Analyzes remittance history and calculates a 0-100 credit score with tier mapping.
 *     tags:
 *       - Verification
 * /api/verification/challenge:
 *   post:
 *     summary: Issue a wallet-ownership challenge
 *     tags: [Verification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerificationCheckRequest'
 *     responses:
 *       200:
 *         description: Scoring completed successfully.
 *       400:
 *         description: Missing fields.
 *       500:
 *         description: Scoring service failed.
 */
verificationRouter.post("/score", validateVerificationBody, async (req, res) => {
  try {
    const { senderAddress, recipientAddress } = req.body;

    const analysisResult = await analyzeRemittanceHistory(
      senderAddress,
      recipientAddress
    );

    const scoreResult = calculateCreditScore(analysisResult);

    res.json(scoreResult);
  } catch (error) {
    console.error("Scoring error:", error);
    res.status(500).json({ error: "Scoring service failed" });
  }
});

 *             type: object
 *             required: [walletAddress]
 *             properties:
 *               walletAddress:
 *                 type: string
 *     responses:
 *       200:
 *         description: Challenge string to sign.
 *       400:
 *         description: Invalid or missing walletAddress.
 */
verificationRouter.post("/challenge", validateWalletAddress, (req, res) => {
  const { walletAddress } = req.body;
  const challenge = createChallenge(walletAddress);
  res.json({ challenge });
});

/**
 * @openapi
 * /api/verification/verify-ownership:
 *   post:
 *     summary: Verify a signed wallet-ownership challenge
 *     tags: [Verification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [walletAddress, challenge, signature]
 *             properties:
 *               walletAddress:
 *                 type: string
 *               challenge:
 *                 type: string
 *               signature:
 *                 type: string
 *                 description: Hex-encoded Ed25519 signature of the challenge.
 *     responses:
 *       200:
 *         description: Ownership verified.
 *       401:
 *         description: Invalid signature.
 *       410:
 *         description: Challenge expired or already used.
 */
verificationRouter.post("/verify-ownership", validateWalletAddress, (req, res) => {
  const { walletAddress, challenge, signature } = req.body;

  if (!challenge || !signature) {
    res.status(400).json({ error: "missing_field", message: "challenge and signature are required" });
    return;
  }

  const result = consumeChallenge(walletAddress, challenge);
  if (!result.ok) {
    res.status(410).json({ error: "challenge_invalid", reason: result.reason });
    return;
  }

  try {
    const keypair = Keypair.fromPublicKey(walletAddress);
    const messageBytes = Buffer.from(challenge, "utf8");
    const sigBytes = Buffer.from(signature, "hex");
    const valid = keypair.verify(messageBytes, sigBytes);
    if (!valid) {
      res.status(401).json({ error: "invalid_signature" });
      return;
    }
  } catch {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  // Track verified wallets in session (stored in req.app.locals per session key is
  // out of scope here; we keep it simple with the response — callers accumulate them).
  res.json({ verified: true, walletAddress });
});
