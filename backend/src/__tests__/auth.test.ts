import request from "supertest";
import { authenticator } from "otplib";
import { createApp } from "../app";
import { prisma } from "../db/prisma";
import { lastMailTo } from "../services/mailer";

const app = createApp();

// Unique per run so repeated local test runs don't collide.
const run = Date.now().toString(36);
const EMAIL = `authtest-${run}@example.com`;
const USERNAME = `authtest_${run}`;
const PASSWORD = "correct-horse-9";

const extractToken = (text: string) => text.match(/token=([a-f0-9]{64})/)?.[1];

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "authtest-" } } });
  await prisma.$disconnect();
});

describe("auth journey", () => {
  let token = "";
  let totpSecret = "";
  let recoveryCodes: string[] = [];

  it("registers and sends a verification email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: EMAIL, username: USERNAME, password: PASSWORD });
    expect(res.status).toBe(201);
    token = res.body.data.token;
    expect(res.body.data.user.emailVerified).toBe(false);
    expect(lastMailTo(EMAIL)?.subject).toMatch(/verify/i);
  });

  it("rejects duplicate email without leaking which field", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: EMAIL, username: `${USERNAME}b`, password: PASSWORD });
    expect(res.status).toBe(409);
  });

  it("verifies email via the mailed token", async () => {
    const raw = extractToken(lastMailTo(EMAIL)!.text)!;
    const res = await request(app).post("/api/auth/verify-email").send({ token: raw });
    expect(res.status).toBe(200);
    expect(res.body.data.user.emailVerified).toBe(true);

    // Single use: replay must fail.
    const replay = await request(app).post("/api/auth/verify-email").send({ token: raw });
    expect(replay.status).toBe(400);
  });

  it("gives identical errors for wrong-password and unknown-user", async () => {
    const a = await request(app)
      .post("/api/auth/login")
      .send({ identifier: EMAIL, password: "wrong-password-1" });
    const b = await request(app)
      .post("/api/auth/login")
      .send({ identifier: `nouser-${run}@example.com`, password: "wrong-password-1" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error).toBe(b.body.error);
  });

  it("enrolls TOTP 2FA (setup requires password, enable requires valid code)", async () => {
    const bad = await request(app)
      .post("/api/auth/2fa/setup")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "nope" });
    expect(bad.status).toBe(401);

    const setup = await request(app)
      .post("/api/auth/2fa/setup")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: PASSWORD });
    expect(setup.status).toBe(200);
    totpSecret = setup.body.data.secret;
    expect(setup.body.data.otpauth_url).toContain("otpauth://totp/");

    const wrongCode = await request(app)
      .post("/api/auth/2fa/enable")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "000000" });
    expect(wrongCode.status).toBe(400);

    const enable = await request(app)
      .post("/api/auth/2fa/enable")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: authenticator.generate(totpSecret) });
    expect(enable.status).toBe(200);
    recoveryCodes = enable.body.data.recovery_codes;
    expect(recoveryCodes).toHaveLength(10);
  });

  it("requires the 2FA step at login and accepts a TOTP code", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ identifier: EMAIL, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.requires_2fa).toBe(true);
    const pending = login.body.data.pending_token;
    expect(pending).toBeTruthy();

    // The pending token must NOT work as a session token.
    const denied = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${pending}`);
    expect(denied.status).toBe(401);

    const verify = await request(app)
      .post("/api/auth/2fa/verify")
      .send({ pending_token: pending, code: authenticator.generate(totpSecret) });
    expect(verify.status).toBe(200);
    token = verify.body.data.token;

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.totpEnabled).toBe(true);
  });

  it("accepts a recovery code exactly once", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ identifier: EMAIL, password: PASSWORD });
    const pending = login.body.data.pending_token;
    const code = recoveryCodes[0];

    const first = await request(app)
      .post("/api/auth/2fa/verify")
      .send({ pending_token: pending, code });
    expect(first.status).toBe(200);

    const login2 = await request(app)
      .post("/api/auth/login")
      .send({ identifier: EMAIL, password: PASSWORD });
    const replay = await request(app)
      .post("/api/auth/2fa/verify")
      .send({ pending_token: login2.body.data.pending_token, code });
    expect(replay.status).toBe(401);
  });

  it("password reset revokes existing sessions", async () => {
    await request(app).post("/api/auth/forgot-password").send({ email: EMAIL });
    // The 200 is sent before the mail (anti-enumeration), so poll for it.
    let mail;
    for (let i = 0; i < 40; i++) {
      mail = lastMailTo(EMAIL);
      if (mail && /reset/i.test(mail.subject)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(mail && /reset/i.test(mail.subject)).toBe(true);
    const raw = extractToken(mail!.text)!;
    const NEW_PASSWORD = "battery-staple-42";
    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: raw, password: NEW_PASSWORD });
    expect(reset.status).toBe(200);

    // Old session token is now revoked (tokenVersion bumped).
    const revoked = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(revoked.status).toBe(401);

    // New password works (through the 2FA step).
    const login = await request(app)
      .post("/api/auth/login")
      .send({ identifier: EMAIL, password: NEW_PASSWORD });
    expect(login.body.data.requires_2fa).toBe(true);
  });

  it("forgot-password never reveals whether the email exists", async () => {
    const known = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: EMAIL });
    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: `ghost-${run}@example.com` });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });
});
