import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock("node:https", () => ({
  default: { request: requestMock },
  request: requestMock,
}));
import { auditPublicSite } from "./audit";

afterEach(() => vi.restoreAllMocks());

describe("pinned audit transport", () => {
  it("returns the pinned address in Node's all-address lookup format", async () => {
    let lookupError: Error | null | undefined;
    let lookupAddresses: unknown;
    requestMock.mockImplementation((options, callback) => {
      options.lookup("news.example", { all: true }, (error: Error | null, addresses: unknown) => {
        lookupError = error;
        lookupAddresses = addresses;
      });
      const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void };
      request.destroy = (error) => { request.emit("error", error); request.emit("close"); };
      request.end = () => {
        const response = Object.assign(new PassThrough(), { headers: {}, statusCode: 200 });
        callback(response);
        response.end("missing");
        request.emit("close");
      };
      return request;
    });

    const findings = await auditPublicSite("https://news.example", {
      resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
    });

    expect(findings).toHaveLength(7);
    expect(lookupError).toBeNull();
    expect(lookupAddresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it.each(["oversized", "interrupted", "error"])("settles a %s response stream and preserves TLS hostname and pinned lookup", async (scenario) => {
    requestMock.mockImplementation((options, callback) => {
      expect(options.hostname).toBe("news.example");
      expect(options.servername).toBe("news.example");
      options.lookup("news.example", {}, (error: Error | null, address: string, family: number) => {
        expect(error).toBeNull();
        expect(address).toBe("2606:4700:4700::1111");
        expect(family).toBe(6);
      });
      const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void };
      request.destroy = (error) => { request.emit("error", error); request.emit("close"); };
      request.end = () => {
        const response = Object.assign(new PassThrough(), { headers: {}, statusCode: 200 });
        callback(response);
        queueMicrotask(() => {
          if (scenario === "oversized") response.write(Buffer.alloc(512 * 1024 + 1));
          else if (scenario === "interrupted") { response.emit("aborted"); response.destroy(); }
          else response.destroy(new Error("Connection reset"));
          request.emit("close");
        });
      };
      return request;
    });
    const findings = await auditPublicSite("https://news.example", {
      resolveHostname: async () => [{ address: "2606:4700:4700::1111", family: 6 }],
    });
    expect(findings).toHaveLength(2);
    expect(findings.every(({ state }) => state === "error")).toBe(true);
    expect(findings[0].evidence).toMatch(/size|interrupted|reset/i);
  });

  it("settles when the request signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const end = vi.fn();
    requestMock.mockImplementation(() => {
      const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void };
      request.end = end;
      request.destroy = (error) => { request.emit("error", error); request.emit("close"); };
      return request;
    });
    const findings = await auditPublicSite("https://news.example", {
      resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    expect(findings.every(({ state }) => state === "error")).toBe(true);
    expect(end).not.toHaveBeenCalled();
  });
});
