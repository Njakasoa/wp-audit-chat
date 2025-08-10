import { afterEach, describe, expect, it } from "vitest";
import nock from "nock";
import { checkBrokenLinks, checkBrokenImages } from "./links";

afterEach(() => {
  nock.cleanAll();
});

describe("checkBrokenLinks", () => {
  it("identifies broken links", async () => {
    const html = `
      <a href="/ok">ok</a>
      <a href="/missing">missing</a>
      <a href="/method">method</a>
      <a href="https://external.com/ok">external</a>
      <a href="/duplicate">dup1</a>
      <a href="/duplicate">dup2</a>
    `;
    nock("https://site.com")
      .head("/ok").reply(200)
      .head("/missing").reply(404)
      .head("/method").reply(405)
      .get("/method").reply(200)
      .head("/duplicate").reply(200);
    nock("https://external.com")
      .head("/ok").reply(200);

    const result = await checkBrokenLinks("https://site.com", html);
    expect(result.total).toBe(5);
    expect(result.broken).toEqual(["https://site.com/missing"]);
  });
});

describe("checkBrokenImages", () => {
  it("identifies broken images", async () => {
    const html = `
      <img src="/ok" />
      <img src="/missing" />
      <img src="/method" />
      <img src="https://cdn.com/good.jpg" />
      <img src="/dup" />
      <img src="/dup" />
    `;
    nock("https://images.com")
      .head("/ok").reply(200)
      .head("/missing").reply(404)
      .head("/method").reply(405)
      .get("/method").reply(200)
      .head("/dup").reply(200);
    nock("https://cdn.com")
      .head("/good.jpg").reply(200);

    const result = await checkBrokenImages("https://images.com", html);
    expect(result.total).toBe(5);
    expect(result.broken).toEqual(["https://images.com/missing"]);
  });
});
