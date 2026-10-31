import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signUp } from "./test.setup";

type T = ReturnType<typeof setup>;
const store = (t: T, type = "image/jpeg", body = "jpegbytes") => t.run((ctx) => ctx.storage.store(new Blob([body], { type })));
const exists = (t: T, id: Id<"_storage">) => t.run(async (ctx) => (await ctx.db.system.get(id)) !== null);

async function job(t: T) {
  const owner = await signUp(t, "owner@peak.example");
  const project = (await owner.as.mutation(api.projects.create, { organizationId: owner.organizationId, data: { name: "Miller roof" } }))!;
  const estimate = (await owner.as.mutation(api.estimates.create, {
    organizationId: owner.organizationId,
    data: { title: "Roof", projectId: project._id, items: [{ description: "Shingles", quantity: 1, unitPrice: 100, totalPrice: 100 }] },
  }))!;
  return { ...owner, projectId: project._id as Id<"projects">, estimateId: estimate._id as Id<"estimates"> };
}

describe("job photos", () => {
  test("photos on an estimate show on it and on its project, with captions", async () => {
    const t = setup();
    const { as, organizationId, estimateId, projectId } = await job(t);
    expect(await as.mutation(api.photos.uploadUrl, { organizationId })).toEqual(expect.any(String));
    const before = await as.mutation(api.photos.add, { storageId: await store(t), fileName: "before.jpg", estimateId, caption: "Hail damage, north slope" });
    await as.mutation(api.photos.add, { storageId: await store(t, ""), fileName: "IMG_0042.HEIC", projectId });

    const onEstimate = await as.query(api.photos.list, { estimateId });
    expect(onEstimate).toEqual([expect.objectContaining({ id: before, fileName: "before.jpg", caption: "Hail damage, north slope", url: expect.any(String) })]);
    const onProject = await as.query(api.photos.list, { projectId });
    expect(onProject.map((p: { fileName: string; from?: string }) => [p.fileName, p.from?.startsWith("EST-") ?? false])).toEqual(
      expect.arrayContaining([
        ["before.jpg", true],
        ["IMG_0042.HEIC", false],
      ]),
    );

    await as.mutation(api.photos.setCaption, { id: before, caption: "  After tear-off  " });
    expect((await as.query(api.photos.list, { estimateId }))[0].caption).toBe("After tear-off");
  });

  test("only images of 15MB or less, on one estimate or project; the file goes when the photo does", async () => {
    const t = setup();
    const { as, estimateId, projectId } = await job(t);
    const pdf = await store(t, "application/pdf");
    await expect(as.mutation(api.photos.add, { storageId: pdf, fileName: "plan.pdf", estimateId })).rejects.toThrow(/JPEG, PNG, HEIC or WebP/);
    const big = await store(t, "image/jpeg", "x".repeat(15 * 1024 * 1024 + 1));
    await expect(as.mutation(api.photos.add, { storageId: big, fileName: "big.jpg", estimateId })).rejects.toThrow(/15MB/);
    await expect(as.mutation(api.photos.add, { storageId: await store(t), fileName: "a.jpg", estimateId, projectId })).rejects.toThrow(/one estimate or one project/);

    const file = await store(t);
    const id = await as.mutation(api.photos.add, { storageId: file, fileName: "a.jpg", estimateId });
    await as.mutation(api.photos.remove, { id });
    expect(await exists(t, file)).toBe(false);
    expect(await as.query(api.photos.list, { estimateId })).toEqual([]);
  });

  test("another company can't see or add photos; deleting an estimate or project deletes its photos", async () => {
    const t = setup();
    const { as, estimateId, projectId } = await job(t);
    const other = await signUp(t, "rival@example.com");
    await expect(other.as.query(api.photos.list, { estimateId })).rejects.toThrow(/Not found/);
    await expect(other.as.mutation(api.photos.add, { storageId: await store(t), fileName: "x.jpg", projectId })).rejects.toThrow(/Not found/);

    const onEstimate = await store(t);
    const onProject = await store(t);
    await as.mutation(api.photos.add, { storageId: onEstimate, fileName: "e.jpg", estimateId });
    await as.mutation(api.photos.add, { storageId: onProject, fileName: "p.jpg", projectId });
    await as.mutation(api.estimates.remove, { id: estimateId });
    expect(await exists(t, onEstimate)).toBe(false);
    await as.mutation(api.projects.remove, { id: projectId });
    expect(await exists(t, onProject)).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("jobPhotos").collect())).toHaveLength(0);
  });
});
