/** @vitest-environment jsdom */

import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { CitedText } from "./cited-text";

describe("CitedText", () => {
  it("turns [S1] markers into numbered citation chips", () => {
    const view = render(createElement("p", null, createElement(CitedText, { text: "ETL을 설계했습니다.[S1] NL2SQL도 구현했습니다.[S2]" })));
    expect(view.getByLabelText("출처 1").textContent).toBe("1");
    expect(view.getByLabelText("출처 2").textContent).toBe("2");
    expect(view.container.textContent).toBe("ETL을 설계했습니다.1 NL2SQL도 구현했습니다.2");
  });
});
