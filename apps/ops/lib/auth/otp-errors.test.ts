import { describe, expect, it } from "vitest";

import { classifyOtpError } from "./otp-errors";

describe("classifyOtpError", () => {
  it("identifies Supabase email cooldown responses", () => {
    expect(classifyOtpError({ code: "over_email_send_rate_limit", status: 429 })).toBe("cooldown");
  });

  it("keeps unrelated provider failures generic", () => {
    expect(classifyOtpError({ code: "unexpected_failure", status: 500 })).toBe("unavailable");
  });
});
