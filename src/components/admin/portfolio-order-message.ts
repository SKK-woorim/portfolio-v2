export type PortfolioOrderMessage = {
  kind: "success" | "error";
  text: string;
};

export type PortfolioOrderResult = {
  success?: string;
  error?: string;
};

export function getPortfolioOrderMessageRole(message: PortfolioOrderMessage) {
  return message.kind === "error" ? "alert" : "status";
}

export function getPortfolioOrderOutcome<Item>(result: PortfolioOrderResult, nextItems: Item[], previousItems: Item[]) {
  if (result.error) {
    return {
      items: previousItems,
      message: { kind: "error", text: result.error } satisfies PortfolioOrderMessage,
    };
  }
  if (result.success) {
    return {
      items: nextItems,
      message: { kind: "success", text: result.success } satisfies PortfolioOrderMessage,
    };
  }
  return { items: nextItems, message: undefined };
}
