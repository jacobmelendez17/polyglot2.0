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

  describe("getList('review')", () => {
    const REVIEW_PAGE = {
      items: [
        {
          id: "item-1",
          kind: "edit" as const,
          itemLabel: "el gato",
          meaningLabel: "cat",
          levelNumber: 1,
          groupName: "Animals",
          authorName: "Ada",
          updatedAt: "2026-03-04T05:06:07.000Z",
          version: 4,
        },
      ],
      nextCursor: null,
      hasPreviousPage: true,
      previousCursor: "prev",
    };
    const LIST_PARAMS = {
      pagination: { page: 1, perPage: 20 },
      sort: { field: "review_order", order: "ASC" as const },
      filter: { language: "lang-1", cursor: "here" },
    };

    function reviewProvider() {
      const request = vi.fn<RequestFn>(async () => REVIEW_PAGE as never);
      return {
        request,
        provider: createAdminDataProvider({ request: request as never }),
      };
    }

    it("asks the review endpoint, not the curriculum one", async () => {
      const { provider, request } = reviewProvider();
      await provider.getList("review", LIST_PARAMS);
      expect(request.mock.calls[0]?.[0]).toBe(
        "/review?language=lang-1&cursor=here&limit=20",
      );
    });

    it("maps the page onto partial pagination, with the server's cursors and no total", async () => {
      const { provider } = reviewProvider();
      const result = await provider.getList("review", LIST_PARAMS);
      expect(result.data).toEqual(REVIEW_PAGE.items);
      expect(result.pageInfo).toEqual({
        hasNextPage: false,
        hasPreviousPage: true,
      });
      expect(result.meta).toEqual({ nextCursor: null, previousCursor: "prev" });
      expect(result).not.toHaveProperty("total");
    });

    it.each([
      ["another sort", { sort: { field: "id", order: "ASC" as const } }],
      ["a page jump", { pagination: { page: 2, perPage: 20 } }],
      ["a curriculum filter", { filter: { language: "lang-1", level: "x" } }],
    ])("refuses %s without calling the server", async (_name, override) => {
      const { provider, request } = reviewProvider();
      const error = await rejection(
        provider.getList("review", { ...LIST_PARAMS, ...override }),
      );
      expect(error.kind).toBe("unsupported");
      expect(request).not.toHaveBeenCalled();
    });

    it("propagates a denial instead of returning an empty queue", async () => {
      const denial = new AdminApiError("FORBIDDEN", 403);
      const provider = createAdminDataProvider({
        request: (async () => {
          throw denial;
        }) as never,
      });
      await expect(provider.getList("review", LIST_PARAMS)).rejects.toBe(
        denial,
      );
    });
  });

  describe("publishReviewItem (an explicit command)", () => {
    const COMMAND = {
      itemId: "11111111-1111-4111-8111-111111111111",
      expectedVersion: 3,
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    };

    it("posts exactly the command — no actor, no role — to the publish endpoint", async () => {
      const request = vi.fn<RequestFn>(
        async () => ({ itemId: COMMAND.itemId }) as never,
      );
      const provider = createAdminDataProvider({ request: request as never });

      await expect(provider.publishReviewItem(COMMAND)).resolves.toEqual({
        itemId: COMMAND.itemId,
      });

      const [path, , options] = request.mock.calls[0] as [
        string,
        unknown,
        { body: unknown },
      ];
      expect(path).toBe("/review/publish");
      expect(options.body).toEqual(COMMAND);
      expect(Object.keys(options.body as object).sort()).toEqual([
        "expectedVersion",
        "idempotencyKey",
        "itemId",
      ]);
    });

    it("validates the answer against the contract", async () => {
      const request = vi.fn<RequestFn>(async (_path, schema) => {
        // The real client would reject a payload that does not match; prove the
        // provider hands it the right schema.
        return (schema as { parse: (v: unknown) => unknown }).parse({
          itemId: COMMAND.itemId,
        }) as never;
      });
      const provider = createAdminDataProvider({ request: request as never });
      await expect(provider.publishReviewItem(COMMAND)).resolves.toEqual({
        itemId: COMMAND.itemId,
      });
      const schema = request.mock.calls[0]?.[1] as {
        safeParse: (v: unknown) => { success: boolean };
      };
      expect(schema.safeParse({}).success).toBe(false);
    });

    it("propagates a stale-version conflict unchanged, for the dialog to explain", async () => {
      const conflict = new AdminApiError("CONFLICT", 409, undefined, {
        serverMessage: "This item changed after you opened it.",
      });
      const provider = createAdminDataProvider({
        request: (async () => {
          throw conflict;
        }) as never,
      });
      await expect(provider.publishReviewItem(COMMAND)).rejects.toBe(conflict);
    });

    it("is not reachable through React Admin's generic mutations", async () => {
      const { provider, request } = (() => {
        const r = vi.fn<RequestFn>(async () => ({}) as never);
        return {
          request: r,
          provider: createAdminDataProvider({ request: r as never }),
        };
      })();
      for (const attempt of [
        provider.update("review", { id: "x", data: {}, previousData: {} }),
        provider.create("review", { data: {} }),
        provider.delete("review", { id: "x" }),
        provider.updateMany("review", { ids: ["x"], data: {} }),
        provider.deleteMany("review", { ids: ["x"] }),
      ]) {
        const error = await rejection(attempt);
        expect(error.kind).toBe("unsupported");
      }
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe("getList('levels')", () => {
    const LEVELS = {
      items: [
        {
          id: "level-1",
          levelNumber: 1,
          name: "Basics",
          status: "published" as const,
          cefrLevel: "A1" as const,
          vocabularyItems: 45,
          grammarItems: 12,
          vocabularyGroups: 4,
        },
      ],
      truncated: false,
    };
    const LIST_PARAMS = {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "level_number", order: "ASC" as const },
      filter: { language: "lang-1", cursor: undefined },
    };

    function levelsProvider(answer: unknown = LEVELS) {
      const request = vi.fn<RequestFn>(async () => answer as never);
      return {
        request,
        provider: createAdminDataProvider({ request: request as never }),
      };
    }

    it("asks the levels endpoint for the language, and for nothing else", async () => {
      const { provider, request } = levelsProvider();
      await provider.getList("levels", LIST_PARAMS);
      expect(request.mock.calls[0]?.[0]).toBe("/levels?language=lang-1");
    });

    it("answers the one bounded response as a list whose length is its total", async () => {
      const { provider } = levelsProvider();
      const result = await provider.getList("levels", LIST_PARAMS);
      expect(result.data).toEqual(LEVELS.items);
      expect(result.total).toBe(1);
      expect(result).not.toHaveProperty("pageInfo");
      expect(result.meta).toEqual({ truncated: false });
    });

    it("passes on that the response was cut short", async () => {
      const { provider } = levelsProvider({ ...LEVELS, truncated: true });
      const result = await provider.getList("levels", LIST_PARAMS);
      expect(result.meta).toEqual({ truncated: true });
    });

    it.each([
      ["another sort", { sort: { field: "name", order: "ASC" as const } }],
      ["a page jump", { pagination: { page: 2, perPage: 100 } }],
      ["a cursor", { filter: { language: "lang-1", cursor: "tok" } }],
      ["a filter", { filter: { language: "lang-1", status: "draft" } }],
    ])("refuses %s without calling the server", async (_name, override) => {
      const { provider, request } = levelsProvider();
      const error = await rejection(
        provider.getList("levels", { ...LIST_PARAMS, ...override }),
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
      await expect(provider.getList("levels", LIST_PARAMS)).rejects.toBe(
        denial,
      );
    });
  });

  describe("createLevel and updateLevel (explicit commands)", () => {
    const CREATE = {
      languageId: "11111111-1111-4111-8111-111111111111",
      levelNumber: 4,
      name: "Colors",
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    };
    const LEVEL_ID = "33333333-3333-4333-8333-333333333333";
    const UPDATE = {
      name: null,
      status: "published" as const,
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
    };

    function commandProvider(answer: unknown) {
      const request = vi.fn<RequestFn>(async () => answer as never);
      return {
        request,
        provider: createAdminDataProvider({ request: request as never }),
      };
    }

    it("posts exactly the create command — no actor, no role — to the collection", async () => {
      const { provider, request } = commandProvider({ levelId: LEVEL_ID });

      await expect(provider.createLevel(CREATE)).resolves.toEqual({
        levelId: LEVEL_ID,
      });

      const [path, , options] = request.mock.calls[0] as [
        string,
        unknown,
        { body: unknown; method?: string },
      ];
      expect(path).toBe("/levels");
      expect(options.body).toEqual(CREATE);
      // A POST (the client's default), not a PATCH.
      expect(options.method).toBeUndefined();
    });

    it("patches exactly the fields it was given, to the one level named in the path", async () => {
      const { provider, request } = commandProvider({ levelId: LEVEL_ID });

      await expect(provider.updateLevel(LEVEL_ID, UPDATE)).resolves.toEqual({
        levelId: LEVEL_ID,
      });

      const [path, , options] = request.mock.calls[0] as [
        string,
        unknown,
        { body: unknown; method: string },
      ];
      expect(path).toBe(`/levels/${LEVEL_ID}`);
      expect(options.method).toBe("PATCH");
      // `null` survives (it means "clear"); nothing is added (no levelId, no actor).
      expect(options.body).toEqual(UPDATE);
      expect(options.body).not.toHaveProperty("levelId");
      expect(options.body).not.toHaveProperty("languageId");
    });

    it("encodes the id so it can only ever be one path segment", async () => {
      const { provider, request } = commandProvider({ levelId: "x" });
      await provider.updateLevel("a/b?c", UPDATE);
      expect(request.mock.calls[0]?.[0]).toBe("/levels/a%2Fb%3Fc");
    });

    it("validates each answer against the contract", async () => {
      const { provider, request } = commandProvider({ levelId: LEVEL_ID });
      await provider.createLevel(CREATE);
      await provider.updateLevel(LEVEL_ID, UPDATE);
      for (const call of request.mock.calls) {
        const schema = call[1] as {
          safeParse: (v: unknown) => { success: boolean };
        };
        expect(schema.safeParse({ levelId: LEVEL_ID }).success).toBe(true);
        expect(schema.safeParse({}).success).toBe(false);
      }
    });

    it("propagates a refusal unchanged, for the form to explain", async () => {
      const refusal = new AdminApiError("VALIDATION_FAILED", 422, undefined, {
        serverMessage: "Level 4 already exists for this language.",
      });
      const provider = createAdminDataProvider({
        request: (async () => {
          throw refusal;
        }) as never,
      });
      await expect(provider.createLevel(CREATE)).rejects.toBe(refusal);
      await expect(provider.updateLevel(LEVEL_ID, UPDATE)).rejects.toBe(
        refusal,
      );
    });

    it("is not reachable through React Admin's generic mutations", async () => {
      const { provider, request } = commandProvider({});
      for (const attempt of [
        provider.update("levels", { id: "x", data: {}, previousData: {} }),
        provider.create("levels", { data: {} }),
        provider.delete("levels", { id: "x" }),
        provider.updateMany("levels", { ids: ["x"], data: {} }),
        provider.deleteMany("levels", { ids: ["x"] }),
      ]) {
        expect((await rejection(attempt)).kind).toBe("unsupported");
      }
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe("getList('groups')", () => {
    const GROUPS = {
      items: [
        {
          id: "group-1",
          levelId: "level-1",
          name: "Fruit",
          status: "published" as const,
          position: 1,
        },
      ],
      truncated: false,
    };
    const LIST_PARAMS = {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "group_position", order: "ASC" as const },
      filter: { language: "lang-1", level: "level-1", cursor: undefined },
    };

    function groupsProvider(answer: unknown = GROUPS) {
      const request = vi.fn<RequestFn>(async () => answer as never);
      return {
        request,
        provider: createAdminDataProvider({ request: request as never }),
      };
    }

    it("asks the groups endpoint for the language and the level, and for nothing else", async () => {
      const { provider, request } = groupsProvider();
      await provider.getList("groups", LIST_PARAMS);
      expect(request.mock.calls[0]?.[0]).toBe(
        "/groups?language=lang-1&level=level-1",
      );
    });

    it("answers the one bounded response as a list whose length is its total", async () => {
      const { provider } = groupsProvider();
      const result = await provider.getList("groups", LIST_PARAMS);
      expect(result.data).toEqual(GROUPS.items);
      expect(result.total).toBe(1);
      expect(result).not.toHaveProperty("pageInfo");
      expect(result.meta).toEqual({ truncated: false });
    });

    it("passes on that the response was cut short", async () => {
      const { provider } = groupsProvider({ ...GROUPS, truncated: true });
      const result = await provider.getList("groups", LIST_PARAMS);
      expect(result.meta).toEqual({ truncated: true });
    });

    it("validates the answer against the contract, position and all", async () => {
      const { provider, request } = groupsProvider();
      await provider.getList("groups", LIST_PARAMS);
      const schema = request.mock.calls[0]?.[1] as {
        safeParse: (v: unknown) => { success: boolean };
      };
      expect(schema.safeParse(GROUPS).success).toBe(true);
      expect(
        schema.safeParse({
          ...GROUPS,
          items: [{ ...GROUPS.items[0], position: undefined }],
        }).success,
      ).toBe(false);
    });

    it.each([
      // The position is the order; a list sort must never stand in for it.
      ["a sort by name", { sort: { field: "name", order: "ASC" as const } }],
      [
        "a descending position",
        { sort: { field: "group_position", order: "DESC" as const } },
      ],
      ["a page jump", { pagination: { page: 2, perPage: 100 } }],
      [
        "a cursor",
        { filter: { language: "lang-1", level: "level-1", cursor: "tok" } },
      ],
      [
        "a filter",
        { filter: { language: "lang-1", level: "level-1", status: "draft" } },
      ],
      // Groups are never listed across levels: positions are per level.
      ["no level", { filter: { language: "lang-1" } }],
    ])("refuses %s without calling the server", async (_name, override) => {
      const { provider, request } = groupsProvider();
      const error = await rejection(
        provider.getList("groups", { ...LIST_PARAMS, ...override }),
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
      await expect(provider.getList("groups", LIST_PARAMS)).rejects.toBe(
        denial,
      );
    });
  });

  describe("createGroup and updateGroup (explicit commands)", () => {
    const CREATE = {
      languageId: "11111111-1111-4111-8111-111111111111",
      levelId: "55555555-5555-4555-8555-555555555555",
      name: "Fruit",
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    };
    const GROUP_ID = "33333333-3333-4333-8333-333333333333";
    const UPDATE = {
      name: "Vegetables",
      status: "archived" as const,
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
    };

    function commandProvider(answer: unknown) {
      const request = vi.fn<RequestFn>(async () => answer as never);
      return {
        request,
        provider: createAdminDataProvider({ request: request as never }),
      };
    }

    it("posts exactly the create command — no actor, no role, no position — to the collection", async () => {
      const { provider, request } = commandProvider({ groupId: GROUP_ID });

      await expect(provider.createGroup(CREATE)).resolves.toEqual({
        groupId: GROUP_ID,
      });

      const [path, , options] = request.mock.calls[0] as [
        string,
        unknown,
        { body: unknown; method?: string },
      ];
      expect(path).toBe("/groups");
      expect(options.body).toEqual(CREATE);
      expect(options.body).not.toHaveProperty("position");
      // A POST (the client's default), not a PATCH.
      expect(options.method).toBeUndefined();
    });

    it("patches exactly the fields it was given, to the one group named in the path", async () => {
      const { provider, request } = commandProvider({ groupId: GROUP_ID });

      await expect(provider.updateGroup(GROUP_ID, UPDATE)).resolves.toEqual({
        groupId: GROUP_ID,
      });

      const [path, , options] = request.mock.calls[0] as [
        string,
        unknown,
        { body: unknown; method: string },
      ];
      expect(path).toBe(`/groups/${GROUP_ID}`);
      expect(options.method).toBe("PATCH");
      // Nothing is added: no groupId, no level, no position, no actor.
      expect(options.body).toEqual(UPDATE);
      for (const key of ["groupId", "levelId", "languageId", "position"]) {
        expect(options.body).not.toHaveProperty(key);
      }
    });

    it("encodes the id so it can only ever be one path segment", async () => {
      const { provider, request } = commandProvider({ groupId: "x" });
      await provider.updateGroup("a/b?c", UPDATE);
      expect(request.mock.calls[0]?.[0]).toBe("/groups/a%2Fb%3Fc");
    });

    it("validates each answer against the contract", async () => {
      const { provider, request } = commandProvider({ groupId: GROUP_ID });
      await provider.createGroup(CREATE);
      await provider.updateGroup(GROUP_ID, UPDATE);
      for (const call of request.mock.calls) {
        const schema = call[1] as {
          safeParse: (v: unknown) => { success: boolean };
        };
        expect(schema.safeParse({ groupId: GROUP_ID }).success).toBe(true);
        expect(schema.safeParse({}).success).toBe(false);
      }
    });

    it("propagates a refusal unchanged, for the form to explain", async () => {
      const refusal = new AdminApiError("VALIDATION_FAILED", 422, undefined, {
        serverMessage: "That level doesn't belong to the selected language.",
      });
      const provider = createAdminDataProvider({
        request: (async () => {
          throw refusal;
        }) as never,
      });
      await expect(provider.createGroup(CREATE)).rejects.toBe(refusal);
      await expect(provider.updateGroup(GROUP_ID, UPDATE)).rejects.toBe(
        refusal,
      );
    });

    it("is not reachable through React Admin's generic mutations", async () => {
      const { provider, request } = commandProvider({});
      for (const attempt of [
        provider.update("groups", { id: "x", data: {}, previousData: {} }),
        provider.create("groups", { data: {} }),
        provider.delete("groups", { id: "x" }),
        provider.updateMany("groups", { ids: ["x"], data: {} }),
        provider.deleteMany("groups", { ids: ["x"] }),
      ]) {
        expect((await rejection(attempt)).kind).toBe("unsupported");
      }
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe("getList('users')", () => {
    const ROW = {
      id: "11111111-1111-4111-8111-111111111111",
      displayName: "Ana Lopez",
      username: "ana_lopez",
      role: "writer" as const,
      createdAt: "2026-03-01T12:00:00.000100Z",
      updatedAt: "2026-03-02T09:30:15.123456Z",
    };
    const PAGE = {
      items: [ROW],
      nextCursor: "next",
      hasPreviousPage: true,
      previousCursor: "prev",
    };
    const LIST_PARAMS = {
      pagination: { page: 1, perPage: 20 },
      sort: { field: "created_at", order: "DESC" as const },
      filter: { search: "ana", cursor: "abc" },
    };

    function usersProvider(answer: unknown = PAGE) {
      const request = vi.fn<RequestFn>(async () => answer as never);
      return {
        request,
        provider: createAdminDataProvider({ request: request as never }),
      };
    }

    it("asks the users endpoint for the search and the cursor, and the page size", async () => {
      const { provider, request } = usersProvider();
      await provider.getList("users", LIST_PARAMS);
      expect(request.mock.calls[0]?.[0]).toBe(
        "/users?search=ana&cursor=abc&limit=20",
      );
    });

    it("answers a cursor page: no total, and the server's own cursors passed through", async () => {
      const { provider } = usersProvider();
      const result = await provider.getList("users", LIST_PARAMS);
      expect(result.data).toEqual([ROW]);
      expect(result).not.toHaveProperty("total");
      expect(result.pageInfo).toEqual({
        hasNextPage: true,
        hasPreviousPage: true,
      });
      expect(result.meta).toEqual({
        nextCursor: "next",
        previousCursor: "prev",
      });
    });

    it("validates the answer against the contract: a role that is not one of the five is an error", async () => {
      const { provider, request } = usersProvider();
      await provider.getList("users", LIST_PARAMS);
      const schema = request.mock.calls[0]?.[1] as {
        safeParse: (v: unknown) => { success: boolean };
      };
      expect(schema.safeParse(PAGE).success).toBe(true);
      expect(
        schema.safeParse({
          ...PAGE,
          items: [{ ...ROW, role: "superadmin" }],
        }).success,
      ).toBe(false);
    });

    it.each([
      ["another sort", { sort: { field: "id", order: "ASC" as const } }],
      ["a page jump", { pagination: { page: 2, perPage: 20 } }],
      ["a role filter", { filter: { role: "admin" } }],
      // There is no way to ask for them.
      [
        "a request for sandbox personas",
        { filter: { includeSandbox: "true" } },
      ],
    ])("refuses %s without calling the server", async (_name, override) => {
      const { provider, request } = usersProvider();
      const error = await rejection(
        provider.getList("users", { ...LIST_PARAMS, ...override }),
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
      await expect(provider.getList("users", LIST_PARAMS)).rejects.toBe(denial);
    });
  });

  describe("changeUserRole (an explicit command)", () => {
    const USER_ID = "11111111-1111-4111-8111-111111111111";
    const CHANGE = {
      role: "writer" as const,
      expectedUpdatedAt: "2026-03-02T09:30:15.123456Z",
      reason: "Joined the content team",
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    };
    const RESULT = {
      userId: USER_ID,
      role: "writer" as const,
      updatedAt: "2026-03-02T09:31:00.000001Z",
    };

    function commandProvider(answer: unknown = RESULT) {
      const request = vi.fn<RequestFn>(async () => answer as never);
      return {
        request,
        provider: createAdminDataProvider({ request: request as never }),
      };
    }

    it("patches exactly the command to the role of the one account named in the path", async () => {
      const { provider, request } = commandProvider();

      await expect(provider.changeUserRole(USER_ID, CHANGE)).resolves.toEqual(
        RESULT,
      );

      const [path, , options] = request.mock.calls[0] as [
        string,
        unknown,
        { body: unknown; method: string },
      ];
      expect(path).toBe(`/users/${USER_ID}/role`);
      expect(options.method).toBe("PATCH");
      expect(options.body).toEqual(CHANGE);
      // Nothing is added: no actor, no target in the body, no Clerk id.
      for (const key of [
        "actorUserId",
        "userId",
        "targetUserId",
        "clerkUserId",
      ]) {
        expect(options.body).not.toHaveProperty(key);
      }
    });

    it("encodes the id so it can only ever be one path segment", async () => {
      const { provider, request } = commandProvider();
      await provider.changeUserRole("a/b?c", CHANGE);
      expect(request.mock.calls[0]?.[0]).toBe("/users/a%2Fb%3Fc/role");
    });

    it("validates the answer against the contract", async () => {
      const { provider, request } = commandProvider();
      await provider.changeUserRole(USER_ID, CHANGE);
      const schema = request.mock.calls[0]?.[1] as {
        safeParse: (v: unknown) => { success: boolean };
      };
      expect(schema.safeParse(RESULT).success).toBe(true);
      expect(schema.safeParse({ ...RESULT, role: "owner" }).success).toBe(
        false,
      );
      expect(
        schema.safeParse({ userId: USER_ID, role: "writer" }).success,
      ).toBe(false);
    });

    it("propagates a refusal unchanged, for the dialog to explain", async () => {
      const refusal = new AdminApiError("CONFLICT", 409, undefined, {
        serverMessage: "This account changed after you opened the list.",
      });
      const provider = createAdminDataProvider({
        request: (async () => {
          throw refusal;
        }) as never,
      });
      await expect(provider.changeUserRole(USER_ID, CHANGE)).rejects.toBe(
        refusal,
      );
    });

    it("is not reachable through React Admin's generic mutations", async () => {
      const { provider, request } = commandProvider({});
      for (const attempt of [
        provider.update("users", { id: "x", data: {}, previousData: {} }),
        provider.create("users", { data: {} }),
        provider.delete("users", { id: "x" }),
        provider.updateMany("users", { ids: ["x"], data: {} }),
        provider.deleteMany("users", { ids: ["x"] }),
        provider.getOne("users", { id: "x" }),
        provider.getMany("users", { ids: ["x"] }),
      ]) {
        expect((await rejection(attempt)).kind).toBe("unsupported");
      }
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe("the bulk curriculum commands (explicit commands)", () => {
    const LANGUAGE = "10000000-0000-4000-8000-000000000001";
    const ITEMS = [
      "40000000-0000-4000-8000-00000000000a",
      "40000000-0000-4000-8000-00000000000b",
    ];
    const KEY = "22222222-2222-4222-8222-222222222222";
    const BASE = { languageId: LANGUAGE, itemIds: ITEMS, idempotencyKey: KEY };

    type Provider = ReturnType<typeof createAdminDataProvider>;
    const COMMANDS = [
      {
        name: "bulkPublishCurriculum",
        path: "/curriculum/bulk-publish",
        send: (p: Provider) => p.bulkPublishCurriculum(BASE),
        body: BASE,
        result: { publishedItemIds: ITEMS },
        broken: { publishedItemIds: "nope" },
      },
      {
        name: "bulkArchiveCurriculum",
        path: "/curriculum/bulk-archive",
        send: (p: Provider) => p.bulkArchiveCurriculum(BASE),
        body: BASE,
        result: {
          archivedItemIds: [ITEMS[0]],
          alreadyArchivedItemIds: [ITEMS[1]],
        },
        broken: { archivedItemIds: [ITEMS[0]] },
      },
      {
        name: "bulkMoveCurriculum",
        path: "/curriculum/bulk-move",
        send: (p: Provider) =>
          p.bulkMoveCurriculum({
            ...BASE,
            levelId: "30000000-0000-4000-8000-000000000003",
          }),
        body: { ...BASE, levelId: "30000000-0000-4000-8000-000000000003" },
        result: { movedItemIds: [ITEMS[0]], unchangedItemIds: [ITEMS[1]] },
        broken: { movedItemIds: [ITEMS[0]] },
      },
    ];

    function commandProvider(answer: unknown) {
      const request = vi.fn<RequestFn>(async () => answer as never);
      return {
        request,
        provider: createAdminDataProvider({ request: request as never }),
      };
    }

    describe.each(COMMANDS)("$name", (command) => {
      it("posts exactly the command — no actor, no role — to its own endpoint", async () => {
        const { provider, request } = commandProvider(command.result);

        await expect(command.send(provider)).resolves.toEqual(command.result);

        const [path, , options] = request.mock.calls[0] as [
          string,
          unknown,
          { body: unknown; method?: string },
        ];
        expect(path).toBe(command.path);
        // A command is a POST: the client's default for a request with a body.
        expect(options.method ?? "POST").toBe("POST");
        expect(options.body).toEqual(command.body);
        for (const key of [
          "actorUserId",
          "userId",
          "role",
          "learningItemIds",
        ]) {
          expect(options.body).not.toHaveProperty(key);
        }
      });

      it("validates the answer against the contract", async () => {
        const { provider, request } = commandProvider(command.result);
        await command.send(provider);
        const schema = request.mock.calls[0]?.[1] as {
          safeParse: (v: unknown) => { success: boolean };
        };
        expect(schema.safeParse(command.result).success).toBe(true);
        expect(schema.safeParse(command.broken).success).toBe(false);
        expect(schema.safeParse({}).success).toBe(false);
      });

      it("propagates a refusal unchanged, for the dialog to explain", async () => {
        const refusal = new AdminApiError("CONFLICT", 409, undefined, {
          serverMessage: "Some of the selected items are no longer Pending.",
        });
        const provider = createAdminDataProvider({
          request: (async () => {
            throw refusal;
          }) as never,
        });
        await expect(command.send(provider)).rejects.toBe(refusal);
      });
    });

    it("sends a move to a group as `groupId`, and to both as both", async () => {
      const { provider, request } = commandProvider({
        movedItemIds: [],
        unchangedItemIds: [],
      });
      await provider.bulkMoveCurriculum({ ...BASE, groupId: "g-1" });
      await provider.bulkMoveCurriculum({
        ...BASE,
        levelId: "l-1",
        groupId: "g-1",
      });
      const bodies = request.mock.calls.map(
        (call) => (call[2] as { body: Record<string, unknown> }).body,
      );
      expect(bodies[0]).toEqual({ ...BASE, groupId: "g-1" });
      expect(bodies[1]).toEqual({ ...BASE, levelId: "l-1", groupId: "g-1" });
    });

    it("has no bulk delete, and the generic mutations still reach nothing", async () => {
      const { provider, request } = commandProvider({});
      expect(provider).not.toHaveProperty("bulkDeleteCurriculum");
      for (const attempt of [
        provider.update("curriculum", { id: "x", data: {}, previousData: {} }),
        provider.create("curriculum", { data: {} }),
        provider.delete("curriculum", { id: "x" }),
        provider.updateMany("curriculum", { ids: ["x"], data: {} }),
        provider.deleteMany("curriculum", { ids: ["x"] }),
      ]) {
        expect((await rejection(attempt)).kind).toBe("unsupported");
      }
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe("getList('imports')", () => {
    const IMPORT_PAGE = {
      items: [
        {
          id: "60000000-0000-4000-8000-000000000001",
          originalFilename: "spanish-level-2.csv",
          status: "needs_review" as const,
          totalRows: 61,
          createCount: 43,
          updateCount: 8,
          moveCount: 2,
          unchangedCount: 6,
          reviewCount: 2,
          skippedCount: 0,
          attemptCount: 1,
          createdAt: "2026-09-10T11:59:00.123Z",
          archivedAt: null,
        },
      ],
      nextCursor: "next",
      hasPreviousPage: true,
      previousCursor: "prev",
    };
    const LIST_PARAMS = {
      pagination: { page: 1, perPage: 20 },
      sort: { field: "created_at", order: "DESC" as const },
      filter: { language: "lang-1", cursor: "here" },
    };

    function importsProvider() {
      const request = vi.fn<RequestFn>(async () => IMPORT_PAGE as never);
      return {
        request,
        provider: createAdminDataProvider({ request: request as never }),
      };
    }

    it("asks the imports endpoint for the normal history, with the language, the cursor and the size", async () => {
      const { provider, request } = importsProvider();
      await provider.getList("imports", LIST_PARAMS);
      expect(request.mock.calls[0]?.[0]).toBe(
        "/imports?language=lang-1&cursor=here&limit=20",
      );
    });

    it("asks for the archived history only when the filter says so", async () => {
      const { provider, request } = importsProvider();
      await provider.getList("imports", {
        ...LIST_PARAMS,
        filter: { language: "lang-1", archived: "true" },
      });
      expect(request.mock.calls[0]?.[0]).toBe(
        "/imports?language=lang-1&archived=true&limit=20",
      );
    });

    it("validates the page against the contract", async () => {
      const { provider, request } = importsProvider();
      await provider.getList("imports", LIST_PARAMS);
      const schema = request.mock.calls[0]?.[1] as {
        safeParse: (v: unknown) => { success: boolean };
      };
      expect(schema.safeParse(IMPORT_PAGE).success).toBe(true);
      expect(
        schema.safeParse({
          ...IMPORT_PAGE,
          items: [{ ...IMPORT_PAGE.items[0], status: "teleporting" }],
        }).success,
      ).toBe(false);
    });

    it("maps the page onto partial pagination, with the server's cursors and no total", async () => {
      const { provider } = importsProvider();
      const result = await provider.getList("imports", LIST_PARAMS);
      expect(result.data).toEqual(IMPORT_PAGE.items);
      expect(result.pageInfo).toEqual({
        hasNextPage: true,
        hasPreviousPage: true,
      });
      expect(result.meta).toEqual({
        nextCursor: "next",
        previousCursor: "prev",
      });
      expect(result).not.toHaveProperty("total");
    });

    it.each([
      ["another sort", { sort: { field: "status", order: "ASC" as const } }],
      ["a page jump", { pagination: { page: 2, perPage: 20 } }],
      ["a status filter", { filter: { language: "lang-1", status: "failed" } }],
      ["a search", { filter: { language: "lang-1", search: "level" } }],
    ])("refuses %s without calling the server", async (_name, override) => {
      const { provider, request } = importsProvider();
      const error = await rejection(
        provider.getList("imports", { ...LIST_PARAMS, ...override }),
      );
      expect(error.kind).toBe("unsupported");
      expect(request).not.toHaveBeenCalled();
    });

    it("propagates a denial instead of returning an empty history", async () => {
      const denial = new AdminApiError("FORBIDDEN", 403);
      const provider = createAdminDataProvider({
        request: (async () => {
          throw denial;
        }) as never,
      });
      await expect(provider.getList("imports", LIST_PARAMS)).rejects.toBe(
        denial,
      );
    });
  });

  describe("getList('logs')", () => {
    const LOG_PAGE = {
      items: [
        {
          id: "e0000000-0000-4000-8000-000000000001",
          createdAt: "2026-10-14T22:46:21.710Z",
          actorId: "a0000000-0000-4000-8000-000000000001",
          actorName: "Ada Admin",
          action: "USER_ROLE_CHANGED" as const,
          resourceType: "user",
          resourceId: "b0000000-0000-4000-8000-000000000002",
          reason: "Reviews lessons",
          correlationId: "correlation-1",
          beforeData: { role: "user" },
          afterData: { role: "writer" },
        },
      ],
      nextCursor: "next",
      hasPreviousPage: true,
      previousCursor: "prev",
    };
    const LIST_PARAMS = {
      pagination: { page: 1, perPage: 25 },
      sort: { field: "created_at", order: "DESC" as const },
      filter: {},
    };

    function logsProvider() {
      const request = vi.fn<RequestFn>(async () => LOG_PAGE as never);
      return {
        request,
        provider: createAdminDataProvider({ request: request as never }),
      };
    }

    it("asks the log endpoint for the first page at the page's size — no filter, no language", async () => {
      const { provider, request } = logsProvider();
      await provider.getList("logs", LIST_PARAMS);
      expect(request.mock.calls[0]?.[0]).toBe("/logs?limit=25");
    });

    it("drops an empty filter — an unset box is simply absent", async () => {
      const { provider, request } = logsProvider();
      await provider.getList("logs", {
        ...LIST_PARAMS,
        // What the filter form and the cursor hook hand over for "nothing chosen".
        filter: {
          actor: "",
          action: undefined,
          resourceType: "",
          cursor: undefined,
        },
      });
      expect(request.mock.calls[0]?.[0]).toBe("/logs?limit=25");
    });

    it("writes the filters in the log's own order", async () => {
      const { provider, request } = logsProvider();
      await provider.getList("logs", {
        ...LIST_PARAMS,
        filter: {
          cursor: "here",
          to: "2026-10-14",
          from: "2026-10-01",
          resourceId: "r-1",
          resourceType: "user",
          action: "USER_ROLE_CHANGED",
          actor: "a0000000-0000-4000-8000-000000000001",
        },
      });
      expect(request.mock.calls[0]?.[0]).toBe(
        "/logs?actor=a0000000-0000-4000-8000-000000000001&action=USER_ROLE_CHANGED&resourceType=user&resourceId=r-1&from=2026-10-01&to=2026-10-14&cursor=here&limit=25",
      );
    });

    it("validates the page against the contract", async () => {
      const { provider, request } = logsProvider();
      await provider.getList("logs", LIST_PARAMS);
      const schema = request.mock.calls[0]?.[1] as {
        safeParse: (v: unknown) => { success: boolean };
      };
      expect(schema.safeParse(LOG_PAGE).success).toBe(true);
      expect(
        schema.safeParse({
          ...LOG_PAGE,
          items: [{ ...LOG_PAGE.items[0], action: "SOMETHING_ELSE" }],
        }).success,
      ).toBe(false);
    });

    it("maps the page onto partial pagination, with the server's cursors and no total", async () => {
      const { provider } = logsProvider();
      const result = await provider.getList("logs", LIST_PARAMS);
      expect(result.data).toEqual(LOG_PAGE.items);
      expect(result.pageInfo).toEqual({
        hasNextPage: true,
        hasPreviousPage: true,
      });
      expect(result.meta).toEqual({
        nextCursor: "next",
        previousCursor: "prev",
      });
      expect(result).not.toHaveProperty("total");
    });

    it.each([
      ["another sort", { sort: { field: "action", order: "ASC" as const } }],
      ["a page jump", { pagination: { page: 2, perPage: 25 } }],
      ["a language", { filter: { language: "lang-1" } }],
      ["a search", { filter: { search: "role" } }],
    ])("refuses %s without calling the server", async (_name, override) => {
      const { provider, request } = logsProvider();
      const error = await rejection(
        provider.getList("logs", { ...LIST_PARAMS, ...override }),
      );
      expect(error.kind).toBe("unsupported");
      expect(request).not.toHaveBeenCalled();
    });

    it("propagates a denial instead of returning an empty log", async () => {
      const denial = new AdminApiError("FORBIDDEN", 403);
      const provider = createAdminDataProvider({
        request: (async () => {
          throw denial;
        }) as never,
      });
      await expect(provider.getList("logs", LIST_PARAMS)).rejects.toBe(denial);
    });

    it("has no write at all: the log is read-only", async () => {
      const { provider, request } = logsProvider();
      const errors = await Promise.all([
        rejection(
          provider.update("logs", { id: "x", data: {}, previousData: {} }),
        ),
        rejection(provider.create("logs", { data: {} })),
        rejection(provider.delete("logs", { id: "x" })),
        rejection(provider.getOne("logs", { id: "x" })),
      ]);
      for (const error of errors) expect(error.kind).toBe("unsupported");
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe("the import history commands (explicit commands)", () => {
    const IMPORT_ID = "60000000-0000-4000-8000-000000000001";
    const RESULT = { importId: IMPORT_ID };

    type Provider = ReturnType<typeof createAdminDataProvider>;
    const COMMANDS = [
      {
        name: "archiveImport",
        path: `/imports/${IMPORT_ID}/archive`,
        send: (p: Provider) => p.archiveImport(IMPORT_ID),
        body: {},
      },
      {
        name: "restoreImport",
        path: `/imports/${IMPORT_ID}/restore`,
        send: (p: Provider) => p.restoreImport(IMPORT_ID),
        body: {},
      },
      {
        name: "deleteImport",
        path: `/imports/${IMPORT_ID}/delete`,
        send: (p: Provider) =>
          p.deleteImport(IMPORT_ID, { confirmation: "DELETE" }),
        body: { confirmation: "DELETE" },
      },
    ];

    function commandProvider(answer: unknown = RESULT) {
      const request = vi.fn<RequestFn>(async () => answer as never);
      return {
        request,
        provider: createAdminDataProvider({ request: request as never }),
      };
    }

    describe.each(COMMANDS)("$name", (command) => {
      it("posts exactly the command — the import in the path, nothing else in the body — to its own endpoint", async () => {
        const { provider, request } = commandProvider();

        await expect(command.send(provider)).resolves.toEqual(RESULT);

        const [path, , options] = request.mock.calls[0] as [
          string,
          unknown,
          { body: unknown; method?: string },
        ];
        expect(path).toBe(command.path);
        expect(options.method ?? "POST").toBe("POST");
        expect(options.body).toEqual(command.body);
        for (const key of ["actorUserId", "importId", "userId", "role"]) {
          expect(options.body).not.toHaveProperty(key);
        }
      });

      it("validates the answer against the contract", async () => {
        const { provider, request } = commandProvider();
        await command.send(provider);
        const schema = request.mock.calls[0]?.[1] as {
          safeParse: (v: unknown) => { success: boolean };
        };
        expect(schema.safeParse(RESULT).success).toBe(true);
        expect(schema.safeParse({}).success).toBe(false);
        expect(schema.safeParse({ importId: 7 }).success).toBe(false);
      });

      it("propagates a refusal unchanged, for the screen to explain", async () => {
        const refusal = new AdminApiError("NOT_FOUND", 404, undefined, {
          serverMessage: "This import no longer exists.",
        });
        const provider = createAdminDataProvider({
          request: (async () => {
            throw refusal;
          }) as never,
        });
        await expect(command.send(provider)).rejects.toBe(refusal);
      });
    });

    it("encodes the id so it can only ever be one path segment", async () => {
      const { provider, request } = commandProvider();
      await provider.archiveImport("a/b?c");
      expect(request.mock.calls[0]?.[0]).toBe("/imports/a%2Fb%3Fc/archive");
    });

    it("is not reachable through React Admin's generic mutations", async () => {
      const { provider, request } = commandProvider({});
      for (const attempt of [
        provider.update("imports", { id: "x", data: {}, previousData: {} }),
        provider.create("imports", { data: {} }),
        provider.delete("imports", { id: "x" }),
        provider.updateMany("imports", { ids: ["x"], data: {} }),
        provider.deleteMany("imports", { ids: ["x"] }),
        provider.getOne("imports", { id: "x" }),
      ]) {
        expect((await rejection(attempt)).kind).toBe("unsupported");
      }
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe("getList('dictionary') (spec 26 Unit 9)", () => {
    const WORD = {
      id: "item-1",
      displayWord: "el gato",
      translation: "cat",
      levelNumber: 1,
      groupName: "Animals",
      lookupForm: "gato",
      matchStatus: "auto_matched" as const,
      confidence: "high" as const,
      reviewReason: null,
      manualLock: false,
      entryLemma: "gato",
      entryPartOfSpeech: "noun",
      confirmable: true,
      regionalStatus: "recognized" as const,
    };
    const QUEUE = {
      items: [WORD],
      total: 130,
      counts: {
        unmatched: 3,
        source_data_not_imported: 1,
        auto_matched: 20,
        review_required: 4,
        manual: 9,
        no_mapping: 2,
      },
      regionCode: "es-MX",
      regionCodes: ["es-MX", "es"],
    };
    const LIST_PARAMS = {
      pagination: { page: 1, perPage: 25 },
      sort: { field: "level_group_term", order: "ASC" as const },
      filter: { language: "lang-1" },
    };

    function dictionaryProvider(answer: unknown = QUEUE) {
      const request = vi.fn<RequestFn>(async () => answer as never);
      return {
        request,
        provider: createAdminDataProvider({ request: request as never }),
      };
    }

    it("asks the dictionary endpoint for the first page of the language, at the page size", async () => {
      const { provider, request } = dictionaryProvider();
      await provider.getList("dictionary", LIST_PARAMS);
      expect(request.mock.calls[0]?.[0]).toBe(
        "/dictionary?language=lang-1&limit=25",
      );
    });

    it("turns React Admin's page into the offset the queue pages by", async () => {
      const { provider, request } = dictionaryProvider();
      await provider.getList("dictionary", {
        ...LIST_PARAMS,
        pagination: { page: 3, perPage: 25 },
      });
      expect(request.mock.calls[0]?.[0]).toBe(
        "/dictionary?language=lang-1&limit=25&offset=50",
      );
    });

    it("sends every filter it has, in the page's order", async () => {
      const { provider, request } = dictionaryProvider();
      await provider.getList("dictionary", {
        ...LIST_PARAMS,
        filter: {
          regional: "not_listed",
          region: "es-MX",
          pos: "verb",
          status: "review_required",
          group: "grp",
          level: "lvl",
          language: "lang-1",
        },
      });
      expect(request.mock.calls[0]?.[0]).toBe(
        "/dictionary?language=lang-1&level=lvl&group=grp&status=review_required&pos=verb&region=es-MX&regional=not_listed&limit=25",
      );
    });

    it("drops a filter that is empty — an unset filter is simply absent", async () => {
      const { provider, request } = dictionaryProvider();
      await provider.getList("dictionary", {
        ...LIST_PARAMS,
        filter: { language: "lang-1", level: "", status: undefined },
      });
      expect(request.mock.calls[0]?.[0]).toBe(
        "/dictionary?language=lang-1&limit=25",
      );
    });

    it("answers the page with its real total, and carries the counts and the region in meta", async () => {
      const { provider } = dictionaryProvider();
      const result = await provider.getList("dictionary", LIST_PARAMS);
      expect(result.data).toEqual([WORD]);
      expect(result.total).toBe(130);
      expect(result).not.toHaveProperty("pageInfo");
      expect(result.meta).toEqual({
        counts: QUEUE.counts,
        regionCode: "es-MX",
        regionCodes: ["es-MX", "es"],
      });
    });

    it.each([
      ["another sort", { sort: { field: "term", order: "ASC" as const } }],
      [
        "a descending sort",
        { sort: { field: "level_group_term", order: "DESC" as const } },
      ],
      [
        "a filter it does not have",
        { filter: { language: "lang-1", search: "gato" } },
      ],
      ["no language", { filter: {} }],
      ["a page before the first", { pagination: { page: 0, perPage: 25 } }],
    ])("refuses %s without calling the server", async (_name, override) => {
      const { provider, request } = dictionaryProvider();
      const error = await rejection(
        provider.getList("dictionary", { ...LIST_PARAMS, ...override }),
      );
      expect(error.kind).toBe("unsupported");
      expect(request).not.toHaveBeenCalled();
    });

    it("propagates a denial instead of returning an empty queue", async () => {
      const denial = new AdminApiError("FORBIDDEN", 403);
      const provider = createAdminDataProvider({
        request: (async () => {
          throw denial;
        }) as never,
      });
      await expect(provider.getList("dictionary", LIST_PARAMS)).rejects.toBe(
        denial,
      );
    });
  });

  describe("getList('decks') (spec 26 Unit 10)", () => {
    const DECKS = {
      items: [
        {
          id: "deck-1",
          name: "Colors",
          description: "Colors and shapes",
          itemCount: 8,
          availability: "theme" as const,
          gateLevelNumber: null,
        },
      ],
      truncated: false,
    };
    const LIST_PARAMS = {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "name", order: "ASC" as const },
      filter: { language: "lang-1", cursor: undefined },
    };

    function decksProvider(answer: unknown = DECKS) {
      const request = vi.fn<RequestFn>(async () => answer as never);
      return {
        request,
        provider: createAdminDataProvider({ request: request as never }),
      };
    }

    it("asks the decks endpoint for the language, and for nothing else", async () => {
      const { provider, request } = decksProvider();
      await provider.getList("decks", LIST_PARAMS);
      expect(request.mock.calls[0]?.[0]).toBe("/decks?language=lang-1");
    });

    it("answers the one bounded response as a list whose length is its total, and says if it was cut", async () => {
      const { provider } = decksProvider();
      const result = await provider.getList("decks", LIST_PARAMS);
      expect(result.data).toEqual(DECKS.items);
      expect(result.total).toBe(1);
      expect(result.meta).toEqual({ truncated: false });

      const cut = await decksProvider({
        ...DECKS,
        truncated: true,
      }).provider.getList("decks", LIST_PARAMS);
      expect(cut.meta).toEqual({ truncated: true });
    });

    it.each([
      ["another sort", { sort: { field: "itemCount", order: "ASC" as const } }],
      ["a page jump", { pagination: { page: 2, perPage: 100 } }],
      ["a cursor", { filter: { language: "lang-1", cursor: "tok" } }],
      // There is no way to ask for another kind of deck.
      ["a kind of deck", { filter: { language: "lang-1", kind: "personal" } }],
      ["an owner", { filter: { language: "lang-1", owner: "someone" } }],
    ])("refuses %s without calling the server", async (_name, override) => {
      const { provider, request } = decksProvider();
      const error = await rejection(
        provider.getList("decks", { ...LIST_PARAMS, ...override }),
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
      await expect(provider.getList("decks", LIST_PARAMS)).rejects.toBe(denial);
    });

    it("has no write at all: React Admin's create, update and delete are refused", async () => {
      const { provider, request } = decksProvider();
      for (const call of [
        () => provider.create("decks", { data: {} }),
        () => provider.update("decks", { id: "d", data: {}, previousData: {} }),
        () => provider.delete("decks", { id: "d" }),
      ]) {
        expect((await rejection(call())).kind).toBe("unsupported");
      }
      expect(request).not.toHaveBeenCalled();
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
