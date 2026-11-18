/** @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminSidebar, getCurrentState } from "./admin-sidebar";

const navigation = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("@/app/admin/login/actions", () => ({ logout: vi.fn() }));

afterEach(() => cleanup());

describe("getCurrentState", () => {
  it("marks the exact page and its section, but not siblings or the dashboard for sub-pages", () => {
    expect(getCurrentState("/admin", "/admin")).toBe("page");
    expect(getCurrentState("/admin/posts", "/admin/posts")).toBe("page");
    expect(getCurrentState("/admin/posts/new", "/admin/posts")).toBe("true");
    expect(getCurrentState("/admin/posts/new", "/admin")).toBeUndefined();
    expect(getCurrentState("/admin/portfolio", "/admin/posts")).toBeUndefined();
    expect(getCurrentState("/admin/postsx", "/admin/posts")).toBeUndefined();
  });
});

describe("AdminSidebar", () => {
  it("exposes the current page with aria-current on exactly one link", () => {
    navigation.pathname = "/admin/media";
    const view = render(createElement(AdminSidebar, { email: "admin@example.com" }));
    const nav = view.getByRole("navigation", { name: "관리자 메뉴" });
    const current = nav.querySelectorAll("[aria-current]");

    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe("미디어");
    expect(current[0]?.getAttribute("aria-current")).toBe("page");
  });
});
