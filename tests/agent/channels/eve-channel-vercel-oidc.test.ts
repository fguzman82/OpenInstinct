import type { RouteHandlerArgs } from "eve/channels";
import type * as EveAuth from "eve/channels/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as AuthSession from "@db/services/auth/session";
import * as SessionService from "@db/services/sessions";
import eveChannel from "@agent/channels/eve";

const { vercelOidcAuth } = vi.hoisted(() => ({
  vercelOidcAuth: vi.fn<ReturnType<typeof EveAuth.vercelOidc>>(),
}));

vi.mock("eve/channels/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof EveAuth>()),
  vercelOidc: () => vercelOidcAuth,
}));

const isSessionOwnedMock = vi.spyOn(SessionService, "isSessionOwned");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(AuthSession, "getAuthSession").mockResolvedValue(null);
  vercelOidcAuth.mockResolvedValue(null);
});

describe("Eve channel Vercel OIDC authentication", () => {
  it("maps a verified Vercel OIDC caller to the browser benchmark user", async () => {
    vercelOidcAuth.mockResolvedValue({
      attributes: { sub: "owner:team:project:app:environment:production" },
      authenticator: "vercel-oidc",
      principalId: "owner:team:project:app:environment:production",
      principalType: "service",
    });
    isSessionOwnedMock.mockResolvedValue(true);

    const response = await sessionRoute().handler(
      new Request("https://assistant.example/eve/v1/session/wrun_1/reset", {
        method: "POST",
      }),
      routeContext()
    );

    expect(response.status).not.toBe(401);
    expect(isSessionOwnedMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "better-auth:browser-benchmark" }),
      "wrun_1"
    );
  });

  it("rejects requests without a Better Auth session or Vercel OIDC token", async () => {
    const response = await sessionRoute().handler(
      new Request("https://assistant.example/eve/v1/session/wrun_1/reset", {
        method: "POST",
      }),
      routeContext()
    );

    expect(response.status).toBe(401);
    expect(vercelOidcAuth).toHaveBeenCalled();
    expect(isSessionOwnedMock).not.toHaveBeenCalled();
  });
});

function sessionRoute() {
  const route = eveChannel.routes.find(
    (candidate) =>
      candidate.transport !== "websocket" &&
      candidate.method === "POST" &&
      candidate.path === "/eve/v1/session/:sessionId/reset"
  );
  if (!route || route.transport === "websocket") {
    throw new Error("The Eve session reset route is unavailable.");
  }
  return route;
}

function routeContext() {
  return {
    attachSession: unexpectedRouteRequest,
    from: unexpectedRouteRequest,
    params: { sessionId: "wrun_1" },
    requestIp: null,
    resolveSession: unexpectedRouteRequest,
    to: unexpectedRouteRequest,
    waitUntil: unexpectedRouteRequest,
  } satisfies RouteHandlerArgs;
}

function unexpectedRouteRequest(): never {
  throw new Error("The request should not reach session handling.");
}
