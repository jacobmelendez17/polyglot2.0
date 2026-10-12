import { describe, expect, it, vi } from "vitest";

import type { AdminMe } from "@/domains/admin";

import { AdminApiError } from "./admin-api-error";
import { buildSignInUrl, createAdminAuthProvider } from "./admin-auth-provider";

const WRITER: AdminMe = {
  id: "user-1",
  role: "writer",
  permissions: {
    canAccessAdminArea: true,
    canManageCurriculum: true,
    canPublishCurriculum: false,
    canUseDeveloperTools: false,
    resources: { overview: ["show"], review: ["list", "show"] },
  },
};

function setup(fetchMe = vi.fn(async () => WRITER)) {
  const redirect = vi.fn();
  const provider = createAdminAuthProvider({
    fetchMe,
    signInUrl: () => "/sign-in?redirect_url=%2Fadmin",
    redirect,
  });
  return { provider, fetchMe, redirect };
}

describe("buildSignInUrl", () => {
  it("returns the person to the page they were on, query included", () => {
    expect(
      buildSignInUrl("/sign-in", {
        pathname: "/admin/curriculum",
        search: "?level=2&type=vocabulary",
      }),
    ).toBe(
      "/sign-in?redirect_url=%2Fadmin%2Fcurriculum%3Flevel%3D2%26type%3Dvocabulary",
    );
  });
});

describe("createAdminAuthProvider", () => {
  describe("getPermissions", () => {
    it("returns exactly what the server said", async () => {
      const { provider } = setup();
      await expect(provider.getPermissions!({})).resolves.toEqual(
        WRITER.permissions,
      );
    });

    it("does not keep the answer: the next call asks the server again", async () => {
      const { provider, fetchMe } = setup();
      await provider.getPermissions!({});
      await provider.getPermissions!({});
      expect(fetchMe).toHaveBeenCalledTimes(2);
    });

    it("shares one request among calls made at the same moment", async () => {
      const { provider, fetchMe } = setup();
      await Promise.all([
        provider.getPermissions!({}),
        provider.canAccess!({ resource: "overview", action: "show" }),
        provider.canAccess!({ resource: "review", action: "list" }),
      ]);
      expect(fetchMe).toHaveBeenCalledOnce();
    });
  });

  describe("canAccess", () => {
    it("allows only the resource/action pairs the server listed", async () => {
      const { provider } = setup();
      const can = (resource: string, action: string) =>
        provider.canAccess!({ resource, action });

      await expect(can("overview", "show")).resolves.toBe(true);
      await expect(can("review", "list")).resolves.toBe(true);
      await expect(can("review", "edit")).resolves.toBe(false);
      await expect(can("users", "list")).resolves.toBe(false);
      await expect(can("toString", "show")).resolves.toBe(false);
    });

    it("has no opinion of its own: a revoked role is denied on the next check", async () => {
      const fetchMe = vi
        .fn<() => Promise<AdminMe>>()
        .mockResolvedValueOnce(WRITER)
        .mockResolvedValueOnce({
          ...WRITER,
          role: "user",
          permissions: {
            ...WRITER.permissions,
            canAccessAdminArea: false,
            resources: {},
          },
        });
      const { provider } = setup(fetchMe);

      await expect(
        provider.canAccess!({ resource: "overview", action: "show" }),
      ).resolves.toBe(true);
      await expect(
        provider.canAccess!({ resource: "overview", action: "show" }),
      ).resolves.toBe(false);
    });

    it("surfaces a failure to ask instead of quietly answering no", async () => {
      const failure = new AdminApiError("NETWORK_ERROR", 0);
      const { provider } = setup(
        vi.fn(async () => {
          throw failure;
        }),
      );
      await expect(
        provider.canAccess!({ resource: "overview", action: "show" }),
      ).rejects.toBe(failure);
    });
  });

  describe("checkError", () => {
    // React Admin turns a *rejected* checkError into an empty successful
    // response (see the provider's note), so every case here must resolve.
    it("sends the browser to Clerk on a 401, once, and still resolves", async () => {
      const { provider, redirect } = setup();

      await expect(
        provider.checkError({ status: 401 }),
      ).resolves.toBeUndefined();
      await expect(
        provider.checkError({ status: 401 }),
      ).resolves.toBeUndefined();

      expect(redirect).toHaveBeenCalledOnce();
      expect(redirect).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fadmin");
    });

    it("treats a 403 as 'signed in but not allowed': no sign-out, no redirect", async () => {
      const { provider, redirect } = setup();
      await expect(
        provider.checkError({ status: 403 }),
      ).resolves.toBeUndefined();
      expect(redirect).not.toHaveBeenCalled();
    });

    it.each([404, 409, 422, 429, 500, 0])(
      "ignores a %i, which says nothing about who the caller is",
      async (status) => {
        const { provider, redirect } = setup();
        await expect(provider.checkError({ status })).resolves.toBeUndefined();
        expect(redirect).not.toHaveBeenCalled();
      },
    );

    it("ignores an error with no status at all", async () => {
      const { provider } = setup();
      await expect(provider.checkError(new Error("boom"))).resolves.toBe(
        undefined,
      );
      await expect(provider.checkError(undefined)).resolves.toBe(undefined);
    });
  });

  describe("checkAuth", () => {
    it("resolves while the server still knows who we are", async () => {
      const { provider } = setup();
      await expect(provider.checkAuth({})).resolves.toBeUndefined();
    });

    it("redirects to sign-in and rejects when the session is gone", async () => {
      const failure = new AdminApiError("UNAUTHENTICATED", 401);
      const { provider, redirect } = setup(
        vi.fn(async () => {
          throw failure;
        }),
      );

      await expect(provider.checkAuth({})).rejects.toBe(failure);
      expect(redirect).toHaveBeenCalledOnce();
    });

    it("rejects without redirecting when the account was denied (403)", async () => {
      const failure = new AdminApiError("FORBIDDEN", 403);
      const { provider, redirect } = setup(
        vi.fn(async () => {
          throw failure;
        }),
      );

      await expect(provider.checkAuth({})).rejects.toBe(failure);
      expect(redirect).not.toHaveBeenCalled();
    });
  });

  describe("login / logout", () => {
    it("leaves sign-in to Clerk", async () => {
      const { provider, redirect } = setup();
      await expect(provider.login({})).resolves.toEqual({ redirectTo: false });
      expect(redirect).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fadmin");
    });

    it("leaves sign-out to Clerk: React Admin is told not to navigate", async () => {
      const { provider, fetchMe, redirect } = setup();
      await expect(provider.logout({})).resolves.toBe(false);
      expect(fetchMe).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    });
  });
});
