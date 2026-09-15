import assert from "node:assert/strict";
import { test } from "node:test";
import { createResendMailer } from "./resend.js";

function stubFetch(
  handler: (url: string, init: RequestInit) => Response,
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) =>
    handler(url, init)) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("sendInvite: posts to Resend with the rendered subject/body", async (t) => {
  let seen: { url: string; init: RequestInit } | null = null;
  const restore = stubFetch((url, init) => {
    seen = { url, init };
    return new Response(null, { status: 200 });
  });
  t.after(restore);

  const mailer = createResendMailer({
    apiKey: "re_test_key",
    from: "Pistora <onboarding@resend.dev>",
    log: { error() {} },
  });
  await mailer.sendInvite({ to: "u@x.test", otp: "ABC123" });

  assert.ok(seen);
  assert.equal(seen!.url, "https://api.resend.com/emails");
  assert.equal(seen!.init.method, "POST");
  assert.equal(
    (seen!.init.headers as Record<string, string>).Authorization,
    "Bearer re_test_key",
  );
  const body = JSON.parse(seen!.init.body as string);
  assert.equal(body.from, "Pistora <onboarding@resend.dev>");
  assert.equal(body.to, "u@x.test");
  assert.match(body.subject, /added to Pistora/i);
  assert.match(body.text, /ABC123/);
});

test("sendAccountRequest: posts to the admin with the requester's email and otp", async (t) => {
  let seen: { url: string; init: RequestInit } | null = null;
  const restore = stubFetch((url, init) => {
    seen = { url, init };
    return new Response(null, { status: 200 });
  });
  t.after(restore);

  const mailer = createResendMailer({
    apiKey: "re_test_key",
    from: "Pistora <onboarding@resend.dev>",
    log: { error() {} },
  });
  await mailer.sendAccountRequest({
    to: "admin@x.test",
    requesterEmail: "new@x.test",
    otp: "ZZZ999",
  });

  const body = JSON.parse(seen!.init.body as string);
  assert.equal(body.to, "admin@x.test");
  assert.match(body.subject, /new@x\.test/);
  assert.match(body.text, /new@x\.test/);
  assert.match(body.text, /ZZZ999/);
});

test("a non-ok Resend response throws and logs the response body", async (t) => {
  const errors: string[] = [];
  const restore = stubFetch(() => new Response("bad request", { status: 422 }));
  t.after(restore);

  const mailer = createResendMailer({
    apiKey: "re_test_key",
    from: "Pistora <onboarding@resend.dev>",
    log: { error: (msg) => errors.push(msg) },
  });

  await assert.rejects(() => mailer.sendInvite({ to: "u@x.test", otp: "ABC123" }));
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /422/);
});
