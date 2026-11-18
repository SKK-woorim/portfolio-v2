/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AiProviderOrderForm } from "./ai-provider-order-form";

const updateOrder = vi.hoisted(() => vi.fn<(state: unknown, data: FormData) => Promise<{ success: string }>>()
  .mockResolvedValue({ success: "호출 순서를 저장했습니다." }));
vi.mock("@/app/admin/(workspace)/api-keys/actions", () => ({ updateAiProviderOrder: updateOrder }));

afterEach(() => cleanup());

it("preselects the stored order and submits the selected sequence", async () => {
  const view = render(createElement(AiProviderOrderForm, { order: ["gemini", "local", "openai"] }));
  const select = view.getByRole("combobox", { name: "우선순위" });
  const save = view.getByRole("button", { name: "순서 저장" });

  expect(select).toHaveProperty("value", "gemini,local,openai");
  expect(within(select).getAllByRole("option")).toHaveLength(6);
  expect(save).toHaveProperty("disabled", true);

  fireEvent.change(select, { target: { value: "local,openai,gemini" } });
  expect(save).toHaveProperty("disabled", false);
  fireEvent.click(save);

  await waitFor(() => expect(updateOrder).toHaveBeenCalledOnce());
  expect(updateOrder.mock.calls[0][1].get("providerOrder")).toBe("local,openai,gemini");
  expect(await view.findByText("호출 순서를 저장했습니다.")).toBeDefined();

  view.rerender(createElement(AiProviderOrderForm, { order: ["local", "openai", "gemini"] }));
  expect(save).toHaveProperty("disabled", true);
});
