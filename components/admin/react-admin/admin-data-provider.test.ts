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
