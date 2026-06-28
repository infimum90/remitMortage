import { Request, Response, NextFunction } from "express";
import { loadConfig } from "../config.js";

const config = loadConfig();

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "missing_authorization", message: "Authorization header is required" });
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "invalid_authorization", message: "Invalid authorization format. Expected 'Bearer <token>'" });
  }

  if (token !== config.adminApiKey) {
    return res.status(403).json({ error: "forbidden", message: "Invalid admin API key" });
  }

  return next();
}
