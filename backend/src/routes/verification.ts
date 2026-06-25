import { Router } from "express";
import crypto from "crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { analyzeRemittanceHistory } from "../services/stellar.js";
import { hashReportContent, streamVerificationPdf, VerificationReport } from "../services/pdf.js";
import { calculateCreditScore } from "../services/scoring.js";
import { validateVerificationBody, validateWalletAddress } from "../middleware/validate.js";
import { createChallenge, consumeChallenge } from "../services/challengeStore.js";

export const verificationRouter = Router();

/**
 * Simple in-memory store keyed by reportId.
 * In production this should be replaced by a persistent database (PostgreSQL).
 */
const reportStore = new Map<string, VerificationReport>();

/**
 * @openapi
 * /api/verification/check:
 *   post:
 *     summary: Analyze remittance payment history
 *     description: |
 *       Accepts a Stellar sender wallet and recipient address, queries Horizon for
 *       outgoing USDC payments, and returns a remittance eligibility summary.
 *       The response also includes a `reportId` and `reportHash` — the SHA-256
 *       hash of the report content — ready for on-chain anchoring in the
 *       verification registry contract.
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

    const analysis = await analyzeRemittanceHistory(senderAddress, recipientAddress);

    // Generate a unique report ID and timestamp.
    const reportId = crypto.randomUUID();
    const generatedAt = new Date().toISOString();

    // Compute SHA-256 hash of the report content for on-chain anchoring.
    const reportHash = hashReportContent(reportId, generatedAt, analysis);

    const report: VerificationReport = {
      reportId,
      generatedAt,
      analysis,
      reportHash,
    };

    // Cache the report so it can be downloaded via GET /report/:reportId.
    reportStore.set(reportId, report);

    res.json({
      ...analysis,
      reportId,
      generatedAt,
      reportHash,
    });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ error: "Verification service failed" });
  }
});

/**
 * @openapi
 * /api/verification/report/{reportId}:
 *   get:
 *     summary: Download a PDF verification report
 *     description: |
 *       Streams a formatted, branded PDF report for the given report ID.
 *       The report includes the full RemittanceAnalysis result — sender/recipient
 *       addresses, payment history, eligibility verdict, and a SHA-256 hash
 *       footer for on-chain verification.
 *     tags:
 *       - Verification
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         description: Unique report ID returned by POST /api/verification/check.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: PDF report streamed for download.
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Report not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: PDF generation failed unexpectedly.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
verificationRouter.get("/report/:reportId", (req, res) => {
  try {
    const { reportId } = req.params;
    const report = reportStore.get(reportId);

    if (!report) {
      return res.status(404).json({
        error: "report_not_found",
        message: `No report found for ID: ${reportId}`,
      });
    }

    const filename = `remitmortgage-verification-${reportId.slice(0, 8)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    streamVerificationPdf(report, res);
  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ error: "PDF generation failed" });
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

/**
 * @openapi
 * /api/verification/challenge:
 *   post:
 *     summary: Issue a wallet-ownership challenge
 *     tags: [Verification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
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
