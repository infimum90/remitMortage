import { PrismaClient, VerificationStatus } from "@prisma/client";

let prisma: PrismaClient;

function getClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function disconnect(): Promise<void> {
  if (prisma) await prisma.$disconnect();
}

// ── Applicant ─────────────────────────────────────────────────────────────

export async function upsertApplicant(
  stellarAddress: string,
  data: { verificationStatus?: VerificationStatus; creditScore?: number }
) {
  return getClient().applicant.upsert({
    where: { stellarAddress },
    update: { ...data, updatedAt: new Date() },
    create: { stellarAddress, ...data },
  });
}

export async function getApplicant(stellarAddress: string) {
  return getClient().applicant.findUnique({
    where: { stellarAddress },
    include: {
      verificationResults: { orderBy: { analyzedAt: "desc" }, take: 1 },
      loanApplications: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

// ── VerificationResult ────────────────────────────────────────────────────

export async function createVerificationResult(data: {
  applicantId: string;
  reportHash: string;
  totalPayments: number;
  totalVolume: number;
  spanMonths: number;
  eligible: boolean;
}) {
  return getClient().verificationResult.create({ data });
}

// ── LoanApplication ────────────────────────────────────────────────────────

export async function createLoanApplication(data: {
  applicantId: string;
  escrowContractId?: string;
  loanId?: string;
  principal: number;
}) {
  return getClient().loanApplication.create({ data });
}
