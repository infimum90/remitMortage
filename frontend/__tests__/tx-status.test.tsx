import React from "react";
import { render, screen } from "@testing-library/react";
import TransactionResult from "../src/components/tx/TransactionResult";
import TransactionDetails from "../src/components/tx/TransactionDetails";
import {
  extractContractError,
  mapToUiPhase,
  phaseToStepIndex,
  parseTransactionType,
} from "../src/lib/transaction-status";

const RPC_STATUS = {
  SUCCESS: "SUCCESS",
  NOT_FOUND: "NOT_FOUND",
  FAILED: "FAILED",
} as const;

jest.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter", className: "inter" }),
}));

describe("transaction status utilities", () => {
  it("maps RPC status to UI phases based on poll count", () => {
    expect(mapToUiPhase(RPC_STATUS.NOT_FOUND, 1)).toBe("submitted");
    expect(mapToUiPhase(RPC_STATUS.NOT_FOUND, 2)).toBe("simulating");
    expect(mapToUiPhase(RPC_STATUS.NOT_FOUND, 5)).toBe("pending_confirmation");
    expect(mapToUiPhase(RPC_STATUS.SUCCESS, 3)).toBe("confirmed");
    expect(mapToUiPhase(RPC_STATUS.FAILED, 3)).toBe("failed");
  });

  it("converts phases to step indices", () => {
    expect(phaseToStepIndex("submitted")).toBe(1);
    expect(phaseToStepIndex("simulating")).toBe(2);
    expect(phaseToStepIndex("pending_confirmation")).toBe(3);
    expect(phaseToStepIndex("confirmed")).toBe(4);
    expect(phaseToStepIndex("failed")).toBe(4);
  });

  it("parses transaction type from query params", () => {
    expect(parseTransactionType("Deposit")).toBe("Deposit");
    expect(parseTransactionType("Disbursement")).toBe("Disbursement");
    expect(parseTransactionType(null)).toBe("Transaction");
    expect(parseTransactionType("invalid")).toBe("Transaction");
  });
});

describe("TransactionResult", () => {
  const hash = "a".repeat(64);

  it("renders confirmed state with checkmark and explorer link", () => {
    render(
      <TransactionResult
        hash={hash}
        success
        onReturnToDashboard={jest.fn()}
      />
    );

    expect(screen.getByText("Transaction Confirmed")).toBeInTheDocument();
    expect(screen.getByText("Return to Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view on stellarchain/i })).toHaveAttribute(
      "href",
      expect.stringContaining(hash)
    );
  });

  it("renders reverted state with contract error message", () => {
    render(
      <TransactionResult
        hash={hash}
        success={false}
        contractError="Contract invocation failed: trInvokeHostFunctionMalformed"
      />
    );

    expect(screen.getByText("Transaction Failed")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Contract invocation failed: trInvokeHostFunctionMalformed"
    );
    expect(screen.queryByText("Return to Dashboard")).not.toBeInTheDocument();
  });
});

describe("TransactionDetails", () => {
  it("renders transaction metadata and raw JSON logs", () => {
    const logs = {
      status: "SUCCESS",
      txHash: "abc123",
      ledger: 42,
    };

    render(
      <TransactionDetails
        hash="abc123"
        type="Deposit"
        senderAddress="GABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
        gasFee="0.0000100 XLM (100 stroops)"
        logs={logs}
      />
    );

    expect(screen.getByText("Deposit")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByText("0.0000100 XLM (100 stroops)")).toBeInTheDocument();
    expect(screen.getByText(/"ledger": 42/)).toBeInTheDocument();
  });
});

describe("extractContractError", () => {
  it("returns fallback message when no diagnostics are available", () => {
    const response = {
      status: RPC_STATUS.FAILED,
      diagnosticEventsXdr: [],
      resultXdr: {
        result: () => ({
          switch: () => ({ name: "txSuccess" }),
        }),
      },
    } as Parameters<typeof extractContractError>[0];

    expect(extractContractError(response)).toContain("reverted on-chain");
  });
});
