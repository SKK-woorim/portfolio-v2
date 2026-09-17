"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { reorderPortfolioItems } from "@/app/admin/actions";
import { getPortfolioOrderMessageRole, getPortfolioOrderOutcome, type PortfolioOrderMessage } from "./portfolio-order-message";

type OrderItem = { id: string; title: string; type: string; status: string; sort_order: number };
function SortableRow({ item, index, count, disabled, onMove }: { item: OrderItem; index: number; count: number; disabled: boolean; onMove: (from: number, to: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition };
  return <li ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3"><button type="button" {...attributes} {...listeners} disabled={disabled} className="focus-ring cursor-grab rounded-lg p-1 text-[var(--muted)] active:cursor-grabbing disabled:cursor-wait disabled:opacity-50" aria-label={`${item.title} 순서 변경`}><GripVertical size={18} /></button><span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ink)]">{item.title}</span><span className="hidden text-xs text-[var(--body)] sm:block">{item.type}</span><span className="rounded-full bg-[#edf3fb] px-2 py-1 text-xs text-[var(--primary)]">{item.status}</span><span className="inline-flex gap-1"><button type="button" className="focus-ring rounded-md p-1 text-[var(--muted)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-35" aria-label={`${item.title} 위로 이동`} disabled={disabled || index === 0} onClick={() => onMove(index, index - 1)}><ArrowUp size={15} /></button><button type="button" className="focus-ring rounded-md p-1 text-[var(--muted)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-35" aria-label={`${item.title} 아래로 이동`} disabled={disabled || index === count - 1} onClick={() => onMove(index, index + 1)}><ArrowDown size={15} /></button></span></li>;
}

export function PortfolioOrderList({ items }: { items: OrderItem[] }) {
  const [orderedItems, setOrderedItems] = useState(items);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<PortfolioOrderMessage>();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setOrderedItems(items));
    return () => window.cancelAnimationFrame(frame);
  }, [items]);

  function persistOrder(nextItems: OrderItem[], previousItems: OrderItem[]) {
    setOrderedItems(nextItems);
    setMessage(undefined);
    startTransition(async () => {
      const result = await reorderPortfolioItems(nextItems.map((item) => item.id));
      const outcome = getPortfolioOrderOutcome(result, nextItems, previousItems);
      setOrderedItems(outcome.items);
      setMessage(outcome.message);
    });
  }

  function moveItem(from: number, to: number) {
    if (pending || from === to || to < 0 || to >= orderedItems.length) return;
    persistOrder(arrayMove(orderedItems, from, to), orderedItems);
  }

  return <div className="mt-6">
    <p className="text-sm leading-6 text-[var(--body)]">드래그하거나 각 항목의 위·아래 버튼으로 공개 이력의 노출 순서를 바꿀 수 있습니다.</p>
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (pending || !over || active.id === over.id) return;
        const oldIndex = orderedItems.findIndex((item) => item.id === active.id);
        const newIndex = orderedItems.findIndex((item) => item.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        persistOrder(arrayMove(orderedItems, oldIndex, newIndex), orderedItems);
      }}
    >
      <SortableContext items={orderedItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ol className="mt-4 grid gap-2">{orderedItems.map((item, index) => <SortableRow item={item} index={index} count={orderedItems.length} disabled={pending} onMove={moveItem} key={item.id} />)}</ol>
      </SortableContext>
    </DndContext>
    {pending ? <p className="mt-3 text-xs text-[var(--muted)]" role="status">순서 저장 중…</p> : null}
    {message ? <p className={`mt-3 text-xs ${message.kind === "success" ? "text-[var(--primary)]" : "text-[#a22b38]"}`} role={getPortfolioOrderMessageRole(message)}>{message.text}</p> : null}
  </div>;
}
