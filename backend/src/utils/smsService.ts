import twilio from "twilio";

const OTP_SERVICE = process.env.OTP_SERVICE || "mock";

let twilioClient: twilio.Twilio | null = null;

if (OTP_SERVICE === "twilio") {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required when OTP_SERVICE=twilio");
  }

  twilioClient = twilio(accountSid, authToken);
}

export async function sendOTP(phone: string, code: string): Promise<void> {
  if (OTP_SERVICE === "mock") {
    console.log(`[DEV] OTP for ${phone}: ${code}`);
    return;
  }

  if (OTP_SERVICE === "twilio" && twilioClient) {
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!from) {
      throw new Error("TWILIO_PHONE_NUMBER is required");
    }

    await twilioClient.messages.create({
      body: `Your JAFFA verification code is: ${code}. Valid for 5 minutes.`,
      from,
      to: phone,
    });

    console.log(`[SMS] OTP sent to ${phone} via Twilio`);
    return;
  }

  throw new Error(`Unknown OTP_SERVICE: ${OTP_SERVICE}`);
}

export function isMockOTP(): boolean {
  return OTP_SERVICE === "mock";
}

export function generateOTPCode(): string {
  if (OTP_SERVICE === "mock") {
    return "123456";
  }
  return Math.floor(100000 + Math.random() * 900000).toString();
}
