import express from "express";
import request from "supertest";
import { Keypair } from "@stellar/stellar-sdk";
import { ethers } from "ethers";
import nacl from "tweetnacl";
import bs58 from "bs58";

import * as stellarService from "../services/stellar";
import { verificationRouter } from "../routes/verification";
import {
  createChallenge,
  _setEntry,
  _clearStore,
} from "../services/challengeStore";
import { verifyEvmSignature } from "../services/evm";
import { verifySolanaSignature } from "../services/solana";

jest.mock("../services/stellar");

const app = express();
app.use(express.json());
app.use("/api/verification", verificationRouter);
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

// ── challengeStore unit tests ──────────────────────────────────────────────

describe("createChallenge", () => {
  it("returns a unique nonce string", () => {
    const addr = Keypair.random().publicKey();
    const challenge = createChallenge(addr);
    expect(challenge).toMatch(/^RemitMortgage-verify-[a-f0-9]+-\d+$/);
  });

  it("generates distinct challenges on repeated calls", () => {
    const walletAddress = Keypair.random().publicKey();

    expect(createChallenge(walletAddress)).not.toBe(createChallenge(walletAddress));
  });

// ── EVM service unit tests ─────────────────────────────────────────────────

describe("verifyEvmSignature", () => {
  it("returns true for a valid EIP-191 signature", async () => {
    const wallet = ethers.Wallet.createRandom();
    const challenge = "RemitMortgage-verify-abc123-1000";
    const signature = await wallet.signMessage(challenge);
    expect(verifyEvmSignature(wallet.address, challenge, signature)).toBe(true);
  });

  it("returns false for a signature from a different key", async () => {
    const wallet1 = ethers.Wallet.createRandom();
    const wallet2 = ethers.Wallet.createRandom();
    const challenge = "RemitMortgage-verify-abc123-1000";
    const signature = await wallet1.signMessage(challenge);
    expect(verifyEvmSignature(wallet2.address, challenge, signature)).toBe(false);
  });

  it("returns false for a malformed signature", () => {
    const wallet = ethers.Wallet.createRandom();
    expect(verifyEvmSignature(wallet.address, "challenge", "not-a-sig")).toBe(false);
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
});

// ── Solana service unit tests ──────────────────────────────────────────────

describe("verifySolanaSignature", () => {
  it("returns true for a valid Ed25519 signature", () => {
    const keypair = nacl.sign.keyPair();
    const address = bs58.encode(keypair.publicKey);
    const challenge = "RemitMortgage-verify-abc123-1000";
    const messageBytes = new TextEncoder().encode(challenge);
    const sigBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
    const signature = Buffer.from(sigBytes).toString("hex");
    expect(verifySolanaSignature(address, challenge, signature)).toBe(true);
  it("returns not_found when the challenge string does not match", () => {
    const walletAddress = Keypair.random().publicKey();
    createChallenge(walletAddress);

    expect(consumeChallenge(walletAddress, "wrong-challenge")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("returns false for a signature from a different key", () => {
    const keypair1 = nacl.sign.keyPair();
    const keypair2 = nacl.sign.keyPair();
    const address2 = bs58.encode(keypair2.publicKey);
    const challenge = "RemitMortgage-verify-abc123-1000";
    const messageBytes = new TextEncoder().encode(challenge);
    const sigBytes = nacl.sign.detached(messageBytes, keypair1.secretKey);
    const signature = Buffer.from(sigBytes).toString("hex");
    expect(verifySolanaSignature(address2, challenge, signature)).toBe(false);
  });

  it("returns false for an all-zero (invalid) signature", () => {
    const keypair = nacl.sign.keyPair();
    const address = bs58.encode(keypair.publicKey);
    const signature = Buffer.alloc(64).toString("hex");
    expect(verifySolanaSignature(address, "challenge", signature)).toBe(false);
  });
});

// ── POST /challenge ────────────────────────────────────────────────────────

describe("POST /api/verification/challenge", () => {
  it("returns 400 when walletAddress is missing", async () => {
    const res = await request(app).post("/api/verification/challenge").send({ network: "stellar" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when network is missing", async () => {
    const addr = Keypair.random().publicKey();
    const res = await request(app).post("/api/verification/challenge").send({ walletAddress: addr });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid network value", async () => {
    const addr = Keypair.random().publicKey();
    const res = await request(app).post("/api/verification/challenge").send({ walletAddress: addr, network: "bitcoin" });
    expect(res.status).toBe(400);
  });

  it("returns a challenge for a valid Stellar address", async () => {
    const addr = Keypair.random().publicKey();
    const res = await request(app).post("/api/verification/challenge").send({ walletAddress: addr, network: "stellar" });
    expect(res.status).toBe(200);
    expect(res.body.challenge).toMatch(/^RemitMortgage-verify-/);
  });

  it("returns a challenge for a valid Ethereum address", async () => {
    const wallet = ethers.Wallet.createRandom();
    const res = await request(app).post("/api/verification/challenge").send({ walletAddress: wallet.address, network: "ethereum" });
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

  it("returns a challenge for a valid Solana address", async () => {
    const keypair = nacl.sign.keyPair();
    const address = bs58.encode(keypair.publicKey);
    const res = await request(app).post("/api/verification/challenge").send({ walletAddress: address, network: "solana" });
    expect(res.status).toBe(200);
    expect(res.body.challenge).toMatch(/^RemitMortgage-verify-/);
  });

  it("returns 400 for an invalid Ethereum address", async () => {
    const res = await request(app).post("/api/verification/challenge").send({ walletAddress: "0xinvalid", network: "ethereum" });
    expect(res.status).toBe(400);
  });
});

// ── POST /verify-ownership (Stellar) ──────────────────────────────────────

describe("POST /api/verification/verify-ownership — Stellar", () => {
  it("returns verified:true for a valid Stellar signature", async () => {
describe("POST /api/verification/verify-ownership", () => {
  it("returns verified:true for a valid signature", async () => {
    const keypair = Keypair.random();
    const walletAddress = keypair.publicKey();

    const challengeRes = await request(app)
      .post("/api/verification/challenge")
      .send({ walletAddress, network: "stellar" });
    const { challenge } = challengeRes.body;

    const signature = keypair.sign(Buffer.from(challenge, "utf8")).toString("hex");
    const res = await request(app)
      .post("/api/verification/verify-ownership")
      .send({ walletAddress, network: "stellar", challenge, signature });
    const res = await request(app)
      .post("/api/verification/verify-ownership")
      .send({
        walletAddress,
        challenge,
        signature: signChallenge(keypair, challenge),
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verified: true, walletAddress, network: "stellar" });
  });

  it("returns 401 for an invalid Stellar signature", async () => {
    const keypair = Keypair.random();
    const walletAddress = keypair.publicKey();

    const challengeRes = await request(app)
      .post("/api/verification/challenge")
      .send({ walletAddress, network: "stellar" });
    const { challenge } = challengeRes.body;

    const signature = Buffer.alloc(64).toString("hex");
    const res = await request(app)
      .post("/api/verification/verify-ownership")
      .send({ walletAddress, network: "stellar", challenge, signature });
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

    const signature = keypair.sign(Buffer.from(challenge, "utf8")).toString("hex");
    const res = await request(app)
      .post("/api/verification/verify-ownership")
      .send({ walletAddress, network: "stellar", challenge, signature });
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
      .send({ walletAddress, network: "stellar" });
    const { challenge } = challengeRes.body;
    const signature = keypair.sign(Buffer.from(challenge, "utf8")).toString("hex");

    await request(app).post("/api/verification/verify-ownership").send({ walletAddress, network: "stellar", challenge, signature });
    const res = await request(app).post("/api/verification/verify-ownership").send({ walletAddress, network: "stellar", challenge, signature });
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
      .send({ walletAddress, network: "stellar" });
      .send({ walletAddress });

    expect(res.status).toBe(400);
  });
});

// ── POST /verify-ownership (Ethereum) ─────────────────────────────────────

describe("POST /api/verification/verify-ownership — Ethereum", () => {
  it("returns verified:true for a valid EIP-191 signature", async () => {
    const wallet = ethers.Wallet.createRandom();
    const walletAddress = wallet.address;

    const challengeRes = await request(app)
      .post("/api/verification/challenge")
      .send({ walletAddress, network: "ethereum" });
    const { challenge } = challengeRes.body;

    const signature = await wallet.signMessage(challenge);
    const res = await request(app)
      .post("/api/verification/verify-ownership")
      .send({ walletAddress, network: "ethereum", challenge, signature });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verified: true, walletAddress, network: "ethereum" });
  });

  it("returns 401 for a signature from a different Ethereum wallet", async () => {
    const wallet1 = ethers.Wallet.createRandom();
    const wallet2 = ethers.Wallet.createRandom();

    const challengeRes = await request(app)
      .post("/api/verification/challenge")
      .send({ walletAddress: wallet1.address, network: "ethereum" });
    const { challenge } = challengeRes.body;

    const signature = await wallet2.signMessage(challenge);
    const res = await request(app)
      .post("/api/verification/verify-ownership")
      .send({ walletAddress: wallet1.address, network: "ethereum", challenge, signature });

    expect(res.status).toBe(401);
  });
});

// ── POST /verify-ownership (Solana) ───────────────────────────────────────

describe("POST /api/verification/verify-ownership — Solana", () => {
  it("returns verified:true for a valid Ed25519 signature", async () => {
    const keypair = nacl.sign.keyPair();
    const walletAddress = bs58.encode(keypair.publicKey);

    const challengeRes = await request(app)
      .post("/api/verification/challenge")
      .send({ walletAddress, network: "solana" });
    const { challenge } = challengeRes.body;

    const messageBytes = new TextEncoder().encode(challenge);
    const sigBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
    const signature = Buffer.from(sigBytes).toString("hex");

    const res = await request(app)
      .post("/api/verification/verify-ownership")
      .send({ walletAddress, network: "solana", challenge, signature });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verified: true, walletAddress, network: "solana" });
  });

  it("returns 401 for an invalid Solana signature", async () => {
    const keypair = nacl.sign.keyPair();
    const walletAddress = bs58.encode(keypair.publicKey);

    const challengeRes = await request(app)
      .post("/api/verification/challenge")
      .send({ walletAddress, network: "solana" });
    const { challenge } = challengeRes.body;

    const signature = Buffer.alloc(64).toString("hex");
    const res = await request(app)
      .post("/api/verification/verify-ownership")
      .send({ walletAddress, network: "solana", challenge, signature });

    expect(res.status).toBe(401);
  });
});
