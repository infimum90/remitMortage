import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { prisma } from "../services/db.js";

export const auditRouter = Router();

/**
 * @openapi
 * /api/audit-logs:
 *   get:
 *     summary: Query historical transaction logs
 *     description: Returns paginated and filtered audit logs. Admin access only.
 *     tags:
 *       - Audit
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of records per page
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action name
 *       - in: query
 *         name: actorAddress
 *         schema:
 *           type: string
 *         description: Filter by actor wallet address
 *     responses:
 *       200:
 *         description: A paginated list of audit logs
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
auditRouter.get("/", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const action = req.query.action as string | undefined;
    const actorAddress = req.query.actorAddress as string | undefined;

    const where: any = {};
    if (action) where.action = action;
    if (actorAddress) where.actorAddress = actorAddress;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.json({
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Audit query error:", error);
    return res.status(500).json({ error: "Failed to query audit logs" });
  }
});
