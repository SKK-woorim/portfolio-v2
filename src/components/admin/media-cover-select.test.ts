import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaCoverSelect } from "./media-cover-select";

describe("MediaCoverSelect", () => {
  it("renders the controlled cover value so draft restoration can update the form", () => {
    const html = renderToStaticMarkup(createElement(MediaCoverSelect, {
      media: [{ id: "media-1", public_url: "https://example.com/one.png", alt: "첫 이미지", storage_key: "one.png" }, { id: "media-2", public_url: "https://example.com/two.png", alt: "두 번째 이미지", storage_key: "two.png" }],
      value: "media-2",
      onChange: () => undefined,
      helpText: "테스트",
    }));
    expect(html).toContain('<option value="media-2" selected="">두 번째 이미지</option>');
  });
});
