import { Request, Response, NextFunction } from "express";
import { logger } from "../config";

export function errorHandler(
  err: Error & { type?: string; status?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // body-parser errors carry a type/status — map them to client errors
  // instead of a generic 500 (PLAN.md S8/S12).
  if (err.type === "entity.too.large") {
    res.status(413).json({ success: false, error: "Request body too large" });
    return;
  }
  if (err.type === "entity.parse.failed") {
    res.status(400).json({ success: false, error: "Malformed JSON body" });
    return;
  }
  if (err.status && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ success: false, error: "Bad request" });
    return;
  }

  logger.error("Unhandled error", { error: err.message, stack: err.stack });

  res.status(500).json({
    success: false,
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development" ? err.message : undefined,
  });
}
