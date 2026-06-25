import express from "express";
import request from "supertest";
import { Keypair } from "@stellar/stellar-sdk";
import { verificationRouter } from "../routes/verification";
import * as stellarService from "../services/stellar";
import {
  _clearStore,
  _setEntry,
  consumeChallenge,
  createChallenge,
} from "../services/challengeStore";

jest.mock("../services/stellar");

const app = express();
app.use(express.json());
app.use("/api/verification", verificationRouter);

const mockedAnalyzeRemittanceHistory = jest.mocked(
  stellarService.analyzeRemittanceHistory
);

function signChallenge(keypair: Keypair, challenge: string): string {
  return Buffer.from(keypair.sign(Buffer.from(challenge, "utf8"))).toString("hex");
}

beforeEach(() => {
  _clearStore();
  jest.clearAllMocks();
});

describe("challengeStore", () => {
  it("returns a unique challenge string", () => {
    const walletAddress = Keypair.random().publicKey();
    const challenge = createChallenge(walletAddress);

    expect(challenge).toMatch(/^RemitMortgage-verify-[a-f0-9]+-\d+$/);
  });

  it("generates distinct challenges on repeated calls", () => {
    const walletAddress = Keypair.random().publicKey();

    expect(createChallenge(walletAddress)).not.toBe(createChallenge(walletAddress));
  });

  it("returns ok:true for a valid, unexpired challenge and marks it used", () => {
    const walletAddress = Keypair.random().publicKey();
    const challenge = createChallenge(walletAddress);

    expect(consumeChallenge(walletAddress, challenge)).toEqual({
      ok: true,
      challenge,
    });
  });

  it("returns already_used when the same challenge is consumed twice", () => {
    const walletAddress = Keypair.random().publicKey();
    const challenge = createChallenge(walletAddress);

    consumeChallenge(walletAddress, challenge);

    expect(consumeChallenge(walletAddress, challenge)).toEqual({
      ok: false,
      reason: "already_used",
    });
  });

  it("returns expired for an entry past its TTL", () => {
    const walletAddress = Keypair.random().publicKey();
    const challenge = "RemitMortgage-verify-abc123-000";

    _setEntry(walletAddress, {
      challenge,
      expiresAt: Date.now() - 1,
      used: false,
    });

    expect(consumeChallenge(walletAddress, challenge)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("returns not_found for an unknown address", () => {
    const walletAddress = Keypair.random().publicKey();

    expect(consumeChallenge(walletAddress, "RemitMortgage-verify-x-0")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("returns not_found when the challenge string does not match", () => {
    const walletAddress = Keypair.random().publicKey();
    createChallenge(walletAddress);

    expect(consumeChallenge(walletAddress, "wrong-challenge")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("POST /api/verification/score", () => {
  it("returns a calculated credit score for valid request data", async () => {
    const senderAddress = Keypair.random().publicKey();
    const recipientAddress = Keypair.random().publicKey();

    mockedAnalyzeRemittanceHistory.mockResolvedValue({
      senderAddress,
      recipientAddress,
      totalPayments: 12,
      totalAmountUSDC: "6000",
      averageAmountUSDC: "500",
      standardDeviation: 0,
      spanMonths: 12,
      firstPayment: "2023-01-01",
      lastPayment: "2024-01-01",
      eligible: true,
      reason: "OK",
    });

    const res = await request(app)
      .post("/api/verification/score")
      .send({ senderAddress, recipientAddress });

    expect(res.status).toBe(200);
    expect(mockedAnalyzeRemittanceHistory).toHaveBeenCalledWith(
      senderAddress,
      recipientAddress
    );
    expect(res.body).toEqual({
      score: 100,
      breakdown: {
        consistency: 40,
        frequency: 25,
        duration: 20,
        volume: 15,
      },
      tier: "Excellent",
    });
  });
});

describe("POST /api/verification/challenge", () => {
  it("returns 400 for missing walletAddress", async () => {
    const res = await request(app).post("/api/verification/challenge").send({});

    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid G-address", async () => {
    const res = await request(app)
      .post("/api/verification/challenge")
      .send({ walletAddress: "NOT_A_VALID_ADDRESS" });

    expect(res.status).toBe(400);
  });

  it("returns a challenge string for a valid address", async () => {
    const walletAddress = Keypair.random().publicKey();

    const res = await request(app)
      .post("/api/verification/challenge")
      .send({ walletAddress });

    expect(res.status).toBe(200);
    expect(res.body.challenge).toMatch(/^RemitMortgage-verify-/);
  });
});

describe("POST /api/verification/verify-ownership", () => {
  it("returns verified:true for a valid signature", async () => {
    const keypair = Keypair.random();
    const walletAddress = keypair.publicKey();

    const challengeRes = await request(app)
      .post("/api/verification/challenge")
      .send({ walletAddress });
    const { challenge } = challengeRes.body;

    const res = await request(app)
      .post("/api/verification/verify-ownership")
      .send({
        walletAddress,
        challenge,
        signature: signChallenge(keypair, challenge),
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verified: true, walletAddress });
  });

  it("returns 401 for an invalid signature", async () => {
    const keypair = Keypair.random();
    const walletAddress = keypair.publicKey();

    const challengeRes = await request(app)
      .post("/api/verification/challenge")
      .send({ walletAddress });
    const { challenge } = challengeRes.body;

    const res = await request(app)
      .post("/api/verification/verify-ownership")
      .send({
        walletAddress,
        challenge,
        signature: Buffer.alloc(64).toString("hex"),
      });

    expect(res.status).toBe(401);
  });

  it("returns 410 for an expired challenge", async () => {
    const keypair = Keypair.random();
    const walletAddress = keypair.publicKey();
    const challenge = "RemitMortgage-verify-expired-0";

    _setEntry(walletAddress, {
      challenge,
      expiresAt: Date.now() - 1,
      used: false,
    });

    const res = await request(app)
      .post("/api/verification/verify-ownership")
      .send({
        walletAddress,
        challenge,
        signature: signChallenge(keypair, challenge),
      });

    expect(res.status).toBe(410);
    expect(res.body.reason).toBe("expired");
  });

  it("returns 410 when the same challenge is reused", async () => {
    const keypair = Keypair.random();
    const walletAddress = keypair.publicKey();

    const challengeRes = await request(app)
      .post("/api/verification/challenge")
      .send({ walletAddress });
    const { challenge } = challengeRes.body;
    const signature = signChallenge(keypair, challenge);

    await request(app)
      .post("/api/verification/verify-ownership")
      .send({ walletAddress, challenge, signature });

    const res = await request(app)
      .post("/api/verification/verify-ownership")
      .send({ walletAddress, challenge, signature });

    expect(res.status).toBe(410);
    expect(res.body.reason).toBe("already_used");
  });

  it("returns 400 when challenge or signature are missing", async () => {
    const walletAddress = Keypair.random().publicKey();

    const res = await request(app)
      .post("/api/verification/verify-ownership")
      .send({ walletAddress });

    expect(res.status).toBe(400);
  });
});
