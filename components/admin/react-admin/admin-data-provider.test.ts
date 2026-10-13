import { describe, expect, it, vi } from "vitest";

import type { AdminOverview } from "@/domains/admin";

import { AdminApiError } from "./admin-api-error";
import { createAdminDataProvider } from "./admin-data-provider";

const OVERVIEW: AdminOverview = {
  id: "current",
  languageId: "lang-1",
  curriculum: { published: 55, pending: 3, draft: 2, archived: 1 },
};

type RequestFn = (
  path: string,
  schema: unknown,
  options?: unknown,
) => Promise<AdminOverview>;

function providerWith(request = vi.fn<RequestFn>(async () => OVERVIEW)) {
  return {
    request,
    provider: createAdminDataProvider({ request: request as never }),
  };
}

async function rejection(promise: Promise<unknown>): Promise<AdminApiError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AdminApiError);
  return error as AdminApiError;
}

describe("createAdminDataProvider", () => {
  describe("getOne('overview')", () => {
    it("fetches the singleton from /overview and validates it against the contract", async () => {
      const { provider, request } = providerWith();

      const result = await provider.getOne("overview", { id: "current" });

      expect(result.data).toEqual(OVERVIEW);
      expect(request).toHaveBeenCalledOnce();
      const [path, schema] = request.mock.calls[0] as [
        string,
        { safeParse: (value: unknown) => { success: boolean } },
      ];
      expect(path).toBe("/overview");
      expect(schema.safeParse({ id: "current" }).success).toBe(false);
    });

    it("passes React Query's abort signal through", async () => {
      const { provider, request } = providerWith();
      const controller = new AbortController();

      await provider.getOne("overview", {
        id: "current",
        signal: controller.signal,
      });

      expect(request.mock.calls[0]?.[2]).toEqual({ signal: controller.signal });
    });

    it("rejects any id other than the singleton's, without calling the server", async () => {
      const { provider, request } = providerWith();

      const error = await rejection(
        provider.getOne("overview", { id: "someone-elses" }),
      );

      expect(error.kind).toBe("unsupported");
      expect(request).not.toHaveBeenCalled();
    });

    it("propagates a server failure unchanged", async () => {
      const failure = new AdminApiError("FORBIDDEN", 403);
      const { provider } = providerWith(
        vi.fn(async () => {
          throw failure;
        }),
      );

      await expect(provider.getOne("overview", { id: "current" })).rejects.toBe(
        failure,
      );
    });
  });

  describe("getList('curriculum')", () => {
    const PAGE_DTO = {
      items: [
        {
          id: "item-1",
          type: "vocabulary" as const,
          status: "published" as const,
          levelId: "level-1",
          levelNumber: 1,
          itemLabel: "el gato",
          meaningLabel: "cat",
          groupId: null,
          groupName: null,
        },
      ],
      nextCursor: "next",
      hasPreviousPage: true,
      previousCursor: "prev",
    };
    const LIST_PARAMS = {
      pagination: { page: 1, perPage: 20 },
      sort: { field: "curriculum_order", order: "ASC" as const },
      filter: { language: "lang-1", cursor: "here" },
    };

    function listProvider(dto = PAGE_DTO) {
      const request = vi.fn<RequestFn>(async () => dto as never);
      return {
        request,
        provider: createAdminDataProvider({ request: request as never }),
      };
    }

    it("asks the curriculum endpoint with the filters, cursor, and page size", async () => {
      const { provider, request } = listProvider();
      await provider.getList("curriculum", LIST_PARAMS);
      expect(request.mock.calls[0]?.[0]).toBe(
        "/curriculum?language=lang-1&cursor=here&limit=20",
      );
    });

    it("maps the cursor page onto React Admin's partial pagination — with no total", async () => {
      const { provider } = listProvider();
      const result = await provider.getList("curriculum", LIST_PARAMS);

      expect(result.data).toEqual(PAGE_DTO.items);
      expect(result.pageInfo).toEqual({
        hasNextPage: true,
        hasPreviousPage: true,
      });
      expect(result).not.toHaveProperty("total");
    });

    it("hands back the server's cursors, untouched, for the list to navigate with", async () => {
      const { provider } = listProvider();
      const result = await provider.getList("curriculum", LIST_PARAMS);
      expect(result.meta).toEqual({
        nextCursor: "next",
        previousCursor: "prev",
      });
    });

    it("reports no next page on the last page", async () => {
      const { provider } = listProvider({
        ...PAGE_DTO,
        nextCursor: null as never,
        hasPreviousPage: false,
        previousCursor: null as never,
      });
      const result = await provider.getList("curriculum", LIST_PARAMS);
      expect(result.pageInfo).toEqual({
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it.each([
      ["another sort", { sort: { field: "term", order: "ASC" as const } }],
      ["a page jump", { pagination: { page: 3, perPage: 20 } }],
      ["an unknown filter", { filter: { language: "lang-1", x: "1" } }],
    ])("refuses %s without calling the server", async (_name, override) => {
      const { provider, request } = listProvider();
      const error = await rejection(
        provider.getList("curriculum", { ...LIST_PARAMS, ...override }),
      );
      expect(error.kind).toBe("unsupported");
      expect(request).not.toHaveBeenCalled();
    });

    it("propagates a denial instead of returning an empty list", async () => {
      const denial = new AdminApiError("FORBIDDEN", 403);
      const provider = createAdminDataProvider({
        request: (async () => {
          throw denial;
        }) as never,
      });
      await expect(provider.getList("curriculum", LIST_PARAMS)).rejects.toBe(
        denial,
      );
    });
  });

  describe("everything not whitelisted", () => {
    it("rejects an unknown resource with a typed UNSUPPORTED_OPERATION, never a guess", async () => {
      const { provider, request } = providerWith();

      const error = await rejection(provider.getOne("users", { id: "1" }));

      expect(error.code).toBe("UNSUPPORTED_OPERATION");
      expect(error.status).toBe(405);
      expect(error.detail).toBe('getOne on "users"');
      expect(request).not.toHaveBeenCalled();
    });

    // Spec 26 §3: React Admin's generic mutations are never mapped onto
    // users, learning_items, or any table.
    it.each([
      [
        "getList",
        (p: ReturnType<typeof createAdminDataProvider>) =>
          p.getList("overview", {
            pagination: { page: 1, perPage: 10 },
            sort: { field: "id", order: "ASC" },
            filter: {},
          }),
      ],
      [
        "getMany",
        (p: ReturnType<typeof createAdminDataProvider>) =>
          p.getMany("overview", { ids: ["current"] }),
      ],
      [
        "getManyReference",
        (p: ReturnType<typeof createAdminDataProvider>) =>
          p.getManyReference("overview", {
            target: "x",
            id: "1",
            pagination: { page: 1, perPage: 10 },
            sort: { field: "id", order: "ASC" },
            filter: {},
          }),
      ],
      [
        "create",
        (p: ReturnType<typeof createAdminDataProvider>) =>
          p.create("overview", { data: {} }),
      ],
      [
        "update",
        (p: ReturnType<typeof createAdminDataProvider>) =>
          p.update("overview", { id: "current", data: {}, previousData: {} }),
      ],
      [
        "updateMany",
        (p: ReturnType<typeof createAdminDataProvider>) =>
          p.updateMany("overview", { ids: ["current"], data: {} }),
      ],
      [
        "delete",
        (p: ReturnType<typeof createAdminDataProvider>) =>
          p.delete("overview", { id: "current" }),
      ],
      [
        "deleteMany",
        (p: ReturnType<typeof createAdminDataProvider>) =>
          p.deleteMany("overview", { ids: ["current"] }),
      ],
    ])("rejects %s even on a known resource", async (_name, call) => {
      const { provider, request } = providerWith();

      const error = await rejection(call(provider));

      expect(error.kind).toBe("unsupported");
      expect(request).not.toHaveBeenCalled();
    });

    it("does not look like an authentication failure to checkError", async () => {
      const { provider } = providerWith();
      const error = await rejection(provider.getOne("users", { id: "1" }));
      expect([401, 403]).not.toContain(error.status);
    });
  });
});
