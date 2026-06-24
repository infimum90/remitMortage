import { Router } from "express";
import crypto from "crypto";
import { analyzeRemittanceHistory } from "../services/stellar.js";
import { hashReportContent, streamVerificationPdf, VerificationReport } from "../services/pdf.js";
import { validateVerificationBody } from "../middleware/validate.js";

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
