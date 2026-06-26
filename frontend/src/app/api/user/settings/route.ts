import { NextRequest, NextResponse } from "next/server";

type UserSettingsPayload = {
  profile?: {
    displayName?: string;
    email?: string;
  };
  notifications?: {
    paymentDue?: boolean;
    milestoneUpdates?: boolean;
    loanApproval?: boolean;
    webhookUrl?: string;
  };
  contractor?: {
    businessName?: string;
    registrationNumber?: string;
    serviceRegion?: string;
  };
};

const settingsStore = new Map<string, UserSettingsPayload & { updatedAt: string }>();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidWebhookUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UserSettingsPayload & { userId?: string };
    const email = body.profile?.email?.trim() ?? "";
    const webhookUrl = body.notifications?.webhookUrl?.trim() ?? "";

    if (!email || !EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: "A valid linked email address is required." }, { status: 400 });
    }

    if (webhookUrl && !isValidWebhookUrl(webhookUrl)) {
      return NextResponse.json({ error: "Webhook URL must be a valid HTTP or HTTPS URL." }, { status: 400 });
    }

    const savedSettings = {
      profile: {
        displayName: body.profile?.displayName?.trim() ?? "",
        email,
      },
      notifications: {
        paymentDue: Boolean(body.notifications?.paymentDue),
        milestoneUpdates: Boolean(body.notifications?.milestoneUpdates),
        loanApproval: Boolean(body.notifications?.loanApproval),
        webhookUrl,
      },
      contractor: {
        businessName: body.contractor?.businessName?.trim() ?? "",
        registrationNumber: body.contractor?.registrationNumber?.trim() ?? "",
        serviceRegion: body.contractor?.serviceRegion?.trim() ?? "",
      },
      updatedAt: new Date().toISOString(),
    };

    settingsStore.set(body.userId || email, savedSettings);

    return NextResponse.json({ success: true, settings: savedSettings });
  } catch (error) {
    console.error("Settings save error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
