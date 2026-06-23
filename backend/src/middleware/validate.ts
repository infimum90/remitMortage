import { Request, Response, NextFunction } from "express";
import { StrKey } from "@stellar/stellar-sdk";

function isValidGAddress(addr: unknown): boolean {
  if (typeof addr !== "string") return false;
  if (addr.length !== 56) return false;
  if (!addr.startsWith("G")) return false;
  try {
    // Throws if invalid
    StrKey.decodeEd25519PublicKey(addr);
    return true;
  } catch (err) {
    return false;
  }
}

export function validateVerificationBody(req: Request, res: Response, next: NextFunction) {
  const { senderAddress, recipientAddress } = req.body ?? {};

  if (!senderAddress) {
    return res.status(400).json({ error: "missing_field", field: "senderAddress", message: "senderAddress is required" });
  }

  if (!recipientAddress) {
    return res.status(400).json({ error: "missing_field", field: "recipientAddress", message: "recipientAddress is required" });
  }

  if (!isValidGAddress(senderAddress)) {
    return res.status(400).json({ error: "invalid_address", field: "senderAddress", message: "Invalid Stellar G-address" });
  }

  if (!isValidGAddress(recipientAddress)) {
    return res.status(400).json({ error: "invalid_address", field: "recipientAddress", message: "Invalid Stellar G-address" });
  }

  return next();
}

export function validateBorrowerParams(req: Request, res: Response, next: NextFunction) {
  const { address } = req.params ?? {};

  if (!address) {
    return res.status(400).json({ error: "missing_field", field: "address", message: "address parameter is required" });
  }

  if (!isValidGAddress(address)) {
    return res.status(400).json({ error: "invalid_address", field: "address", message: "Invalid Stellar G-address" });
  }

  return next();
}

export function validatePositiveNumber(fieldName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const val = req.body?.[fieldName];
    const num = Number(val);
    if (val === undefined || val === null || Number.isNaN(num) || num <= 0) {
      return res.status(400).json({ error: "invalid_number", field: fieldName, message: `${fieldName} must be a positive number` });
    }
    return next();
  };
}
