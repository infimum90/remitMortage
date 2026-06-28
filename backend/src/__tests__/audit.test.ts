import express from "express";
import request from "supertest";
import { auditRouter } from "../routes/audit.js";
import { logAudit } from "../services/audit.js";
import { prisma } from "../services/db.js";

// Mock the entire db service so we can track prisma calls
jest.mock("../services/db.js", () => ({
  prisma: {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

// Mock config for API key
jest.mock("../config.js", () => ({
  loadConfig: () => ({
    adminApiKey: "test-admin-key",
  }),
}));

const app = express();
app.use(express.json());
app.use("/api/audit-logs", auditRouter);

describe("Audit Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("logAudit creates a record asynchronously and handles errors gracefully", async () => {
    // Setup the mock to reject, simulating a DB failure
    const mockCreate = prisma.auditLog.create as jest.Mock;
    mockCreate.mockRejectedValueOnce(new Error("DB Connection Refused"));

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    // This should not throw an exception, but it will log to console.error
    await logAudit({
      action: "test_action",
      actorAddress: "GABC123",
      ipAddress: "127.0.0.1",
      metadata: { key: "value" },
    });

    // Wait a tiny bit for the catch block to execute (since it's an un-awaited promise inside)
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        action: "test_action",
        actorAddress: "GABC123",
        ipAddress: "127.0.0.1",
        metadata: { key: "value" },
      },
    });
    expect(consoleSpy).toHaveBeenCalledWith("Audit log persistence failed:", expect.any(Error));

    consoleSpy.mockRestore();
  });
});

describe("GET /api/audit-logs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects requests without an authorization header", async () => {
    const res = await request(app).get("/api/audit-logs");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("missing_authorization");
  });

  it("rejects requests with an invalid API key", async () => {
    const res = await request(app)
      .get("/api/audit-logs")
      .set("Authorization", "Bearer wrong-key");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("returns paginated results for authorized requests", async () => {
    const mockLogs = [
      { id: "1", action: "login", actorAddress: "GABC", createdAt: new Date() },
      { id: "2", action: "deposit", actorAddress: "GABC", createdAt: new Date() },
    ];

    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs);
    (prisma.auditLog.count as jest.Mock).mockResolvedValue(2);

    const res = await request(app)
      .get("/api/audit-logs?page=1&limit=10")
      .set("Authorization", "Bearer test-admin-key");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 10,
    });
  });

  it("filters logs by action and actorAddress", async () => {
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.auditLog.count as jest.Mock).mockResolvedValue(0);

    const res = await request(app)
      .get("/api/audit-logs?action=login&actorAddress=GXYZ")
      .set("Authorization", "Bearer test-admin-key");

    expect(res.status).toBe(200);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        action: "login",
        actorAddress: "GXYZ",
      },
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
    });
  });
});
