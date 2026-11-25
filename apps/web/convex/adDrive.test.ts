import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { seal } from "./lib/secretBox";
import { folderQuery, readList, videosQuery } from "./lib/googleDrive";
import { setup, signUp } from "./test.setup";

const KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 1)));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("clips from a Google Drive folder", () => {
  test("Drive's queries and answers", () => {
    expect(folderQuery("Ad clips")).toBe("mimeType = 'application/vnd.google-apps.folder' and name = 'Ad clips' and trashed = false");
    expect(folderQuery("Joe's clips")).toContain("name = 'Joe\\'s clips'");
    expect(videosQuery("F1")).toBe("'F1' in parents and mimeType contains 'video/' and trashed = false");
    expect(readList({ files: [{ id: "a", name: "deck.mov", size: "120", mimeType: "video/quicktime" }, { name: "no id" }], nextPageToken: "p2" })).toEqual({
      files: [{ id: "a", name: "deck.mov", size: 120, mimeType: "video/quicktime" }],
      next: "p2",
    });
  });

  test("connect, watch the folder, hand the runner its files, file each in the library", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "client");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "secret");
    vi.stubEnv("MAILBOX_KEY", KEY);
    vi.stubEnv("ADS_RENDER_TOKEN", "gh");
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "super_admin" });
    const member = await signUp(t, "owner@peak.example");

    // Connect: Google's consent screen, read-only Drive.
    const url = new URL(await staff.as.mutation(api.adDrive.connect, {}));
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/drive.readonly");
    expect(url.searchParams.get("access_type")).toBe("offline");
    await expect(member.as.mutation(api.adDrive.connect, {})).rejects.toThrow("Only Webb Leads staff");

    await t.mutation(internal.adDrive.saveConnection, {
      trade: "painting",
      userId: staff.userId,
      email: "Owner@Gmail.com",
      refreshTokenEnc: await seal("refresh-1", KEY),
      accessToken: "access-1",
      accessExpiresAt: Date.now() + 3_600_000,
    });

    // The folder: found by name, its videos noted once each, and the runner started.
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const u = String(input);
        calls.push(u);
        if (u.startsWith("https://api.github.com/")) return new Response(null, { status: 204 });
        const q = new URL(u).searchParams.get("q") ?? "";
        expect((init?.headers as Record<string, string>).authorization).toBe("Bearer access-1");
        if (q.includes("vnd.google-apps.folder")) return Response.json({ files: [{ id: "F1", name: "Ad clips" }] });
        return Response.json({ files: [{ id: "v1", name: "deck.mov", size: "120000000" }, { id: "v2", name: "fence.MOV", size: "3000000000" }] });
      }),
    );
    expect(await t.action(internal.adDrive.poll, {})).toEqual({ checked: 1, added: 1, started: true });
    expect(calls.some((c) => c.includes("/actions/workflows/ads-clips.yml/dispatches"))).toBe(true);
    // Seen again: nothing new.
    expect((await t.action(internal.adDrive.poll, {})).added).toBe(0);
    let status = await staff.as.query(api.adDrive.status, {});
    expect(status.connected).toMatchObject({ email: "owner@gmail.com", folderName: "Ad clips", found: true });
    expect(status.imports.map((i) => [i.name, i.status, i.error])).toEqual(
      expect.arrayContaining([
        ["deck.mov", "waiting", undefined],
        ["fence.MOV", "failed", "It's over 2 GB: trim it into shorter clips."],
      ]),
    );

    // The runner claims the waiting one, with a token for the folder.
    const claimed = await t.action(internal.adDrive.claimImports, {});
    expect(claimed).toEqual([{ id: expect.any(String), fileId: "v1", name: "deck.mov", token: "access-1" }]);
    expect(await t.action(internal.adDrive.claimImports, {})).toEqual([]);

    // Done: a video in the library, filed as the person who connected the folder.
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["v"], { type: "video/mp4" })));
    const posterStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["p"], { type: "image/jpeg" })));
    const assetId = await t.mutation(internal.adDrive.importDone, { id: claimed[0].id, storageId, posterStorageId, durationSec: 21.5, note: "sound left off" });
    const asset = await t.run((ctx) => ctx.db.get(assetId!));
    expect(asset).toMatchObject({ kind: "video", fileName: "deck.mp4", trade: "painting", durationSec: 21.5, uploadedBy: staff.userId, tags: [] });
    status = await staff.as.query(api.adDrive.status, {});
    expect(status.imports.find((i) => i.name === "deck.mov")).toMatchObject({ status: "done", note: "sound left off" });
    // Saying done twice files nothing more.
    expect(await t.mutation(internal.adDrive.importDone, { id: claimed[0].id, storageId })).toBeNull();

    // A failed one can be tried again.
    const failed = status.imports.find((i) => i.name === "fence.MOV")!;
    await staff.as.mutation(api.adDrive.retry, { id: failed.id });
    expect((await staff.as.query(api.adDrive.status, {})).imports.find((i) => i.name === "fence.MOV")!.status).toBe("waiting");

    // Disconnected: not watched any more.
    await staff.as.mutation(api.adDrive.disconnect, {});
    expect((await staff.as.query(api.adDrive.status, {})).connected).toBeNull();
    expect((await t.action(internal.adDrive.poll, {})).checked).toBe(0);
  });

  test("no folder by that name: said on the page; a permission taken back: shown as not connected", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "client");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "secret");
    vi.stubEnv("MAILBOX_KEY", KEY);
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "super_admin" });
    await t.mutation(internal.adDrive.saveConnection, {
      trade: "painting",
      userId: staff.userId,
      refreshTokenEnc: await seal("refresh-1", KEY),
      accessToken: "old",
      accessExpiresAt: Date.now() - 1000,
    });
    // An expired token is refreshed first, then the folder isn't there.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const u = String(input);
        if (u.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "new", expires_in: 3600 });
        return Response.json({ files: [] });
      }),
    );
    await t.action(internal.adDrive.poll, {});
    let status = await staff.as.query(api.adDrive.status, {});
    expect(status.connected!.error).toContain('No folder named "Ad clips"');
    // Google says the permission is gone.
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("adDrive").collect())[0];
      await ctx.db.patch(row._id, { accessExpiresAt: 0 });
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, { status: 400 })),
    );
    await t.action(internal.adDrive.poll, {});
    status = await staff.as.query(api.adDrive.status, {});
    expect(status.connected).toBeNull();
  });
});
