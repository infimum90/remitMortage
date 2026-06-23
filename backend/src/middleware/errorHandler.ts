import { Request, Response, NextFunction } from "express";

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const statusCode = err?.statusCode || 500;
  const message = err?.message || "Internal Server Error";

  // Log error with request metadata
  console.error(JSON.stringify({
    time: new Date().toISOString(),
    message: message,
    statusCode,
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
    stack: err?.stack ? err.stack.split("\n").slice(0, 5).join(" | ") : undefined,
  }));

  res.status(statusCode).json({ error: message, statusCode, timestamp: new Date().toISOString() });
}
