/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";
import { InviteActivationForm } from "./invite-activation-form";

const loginMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/admin/login/actions", () => ({ login: loginMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));

beforeEach(() => {
  loginMock.mockReset();
  Object.values(auth).forEach((mock) => mock.mockReset());
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

afterEach(() => cleanup());

describe("LoginForm", () => {
  it("labels both fields explicitly with password-manager friendly hints", () => {
    const view = render(createElement(LoginForm));
    const email = view.getByLabelText("이메일") as HTMLInputElement;
    const password = view.getByLabelText("비밀번호") as HTMLInputElement;

    expect(email.id).toBe("admin-login-email");
    expect(view.container.querySelector(`label[for="${email.id}"]`)).toBeTruthy();
    expect(email.type).toBe("email");
    expect(email.name).toBe("email");
    expect(email.autocomplete).toBe("username");
    expect(email.getAttribute("spellcheck")).toBe("false");
    expect(email.getAttribute("enterkeyhint")).toBe("next");
    expect(email.required).toBe(true);

    expect(password.id).toBe("admin-login-password");
    expect(password.name).toBe("password");
    expect(password.type).toBe("password");
    expect(password.autocomplete).toBe("current-password");
    expect(password.required).toBe(true);
    expect(password.getAttribute("onpaste")).toBeNull();
  });

  it("toggles password visibility with a pressed-state button that never submits", () => {
    const view = render(createElement(LoginForm));
    const password = view.getByLabelText("비밀번호") as HTMLInputElement;
    const toggle = view.getByRole("button", { name: "비밀번호 표시" });

    expect(toggle.getAttribute("type")).toBe("button");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(password.type).toBe("text");
    expect(password.getAttribute("spellcheck")).toBe("false");
    fireEvent.click(toggle);
    expect(password.type).toBe("password");
    expect(loginMock).not.toHaveBeenCalled();
  });
});

describe("InviteActivationForm", () => {
  it("asks for the new password once, with the length rule shown above it", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { email: "admin@example.com" } } }, error: null });
    const view = render(createElement(InviteActivationForm));

    const password = await view.findByLabelText("새 비밀번호") as HTMLInputElement;
    expect(view.queryByLabelText("비밀번호 확인")).toBeNull();
    expect(view.container.querySelectorAll('input[type="password"]')).toHaveLength(1);
    expect(password.id).toBe("admin-new-password");
    expect(password.name).toBe("new-password");
    expect(password.autocomplete).toBe("new-password");
    expect(password.minLength).toBe(8);
    const hint = document.getElementById(password.getAttribute("aria-describedby")!)!;
    expect(hint.textContent).toContain("8자 이상");
    // 안내문은 입력보다 앞(위)에 있다.
    expect(hint.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "비밀번호 표시" }));
    expect(password.type).toBe("text");
  });

  it("sets the password with a single entry", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { email: "admin@example.com" } } }, error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    const view = render(createElement(InviteActivationForm));
    const password = await view.findByLabelText("새 비밀번호");

    fireEvent.change(password, { target: { value: "correct horse" } });
    await act(async () => { fireEvent.click(view.getByRole("button", { name: "비밀번호 설정하고 시작하기" })); });

    expect(auth.updateUser).toHaveBeenCalledWith({ password: "correct horse" });
  });

  it("names the expired-link email field and reports success through the status region", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const view = render(createElement(InviteActivationForm));
    const email = await view.findByLabelText("관리자 이메일") as HTMLInputElement;

    expect(email.id).toBe("admin-activate-email");
    expect(email.name).toBe("email");
    expect(email.getAttribute("spellcheck")).toBe("false");
    const status = view.getByRole("status");
    expect(status.textContent).toBe("");

    fireEvent.change(email, { target: { value: "Admin@Example.com " } });
    await act(async () => { fireEvent.click(view.getByRole("button", { name: "비밀번호 설정 이메일 보내기" })); });

    await waitFor(() => expect(status.textContent).toContain("비밀번호 설정 이메일을 보냈습니다."));
    expect(view.getByRole("status")).toBe(status);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("admin@example.com", expect.objectContaining({ redirectTo: expect.stringContaining("/admin/activate") }));
  });
});
