// =============================================================
// Supabase Edge Function: send-push-notification
// Deploy: Supabase Dashboard → Edge Functions
// =============================================================
// Sends a Web Push notification to all subscribed devices.
// Called by the app on:
//   - Pairings confirmed   → "Pairings are set"
//   - First hole entered   → "Scoring has started"
//   - Event Completed      → "Results are in: X won"
//
// SETUP (one time):
//   1. Generate VAPID keys: npx web-push generate-vapid-keys
//   2. Add to Edge Function secrets:
//      VAPID_PUBLIC_KEY=<your public key>
//      VAPID_PRIVATE_KEY=<your private key>
//      VAPID_SUBJECT=mailto:your@email.com
// =============================================================
// Supabase Edge Function: send-push-notification
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const { title, body, url } = await req.json() as {
      title: string; body: string; url?: string;
    };

    if (!title || !body) return json({ error: "title and body required" }, 400);

    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT")!,
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth");

    if (!subs?.length) return json({ sent: 0, skipped: "no subscribers" });

    const payload = JSON.stringify({ title, body, url: url ?? "/" });

    let sent = 0, expired = 0;
    const expiredEndpoints: string[] = [];

    await Promise.all(subs.map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err: any) {
        // Only delete on 404/410 (genuinely expired), not other errors
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          expired++;
          expiredEndpoints.push(sub.endpoint);
        } else {
          console.error("Push failed (non-expiry):", err?.statusCode, err?.message);
          expired++;
        }
      }
    }));

    if (expiredEndpoints.length) {
      await supabase.from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
    }

    return json({ ok: true, sent, expired });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});