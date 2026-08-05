"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { useState, useTransition } from "react";
import { reorderPortfolioItems } from "@/app/admin/actions";

type OrderItem = { id: string; title: string; type: string; status: string; sort_order: number };
function SortableRow({ item }: { item: OrderItem }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition };
  return <li ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3"><button type="button" {...attributes} {...listeners} className="focus-ring cursor-grab rounded-lg p-1 text-[var(--muted)] active:cursor-grabbing" aria-label={`${item.title} 순서 변경`}><GripVertical size={18} /></button><span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ink)]">{item.title}</span><span className="hidden text-xs text-[var(--body)] sm:block">{item.type}</span><span className="rounded-full bg-[#edf3fb] px-2 py-1 text-xs text-[var(--primary)]">{item.status}</span></li>;
}

export function PortfolioOrderList({ items }: { items: OrderItem[] }) {
  const [orderedItems, setOrderedItems] = useState(items);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  return <div className="mt-6"><p className="text-sm leading-6 text-[var(--body)]">드래그해 공개 이력의 노출 순서를 바꿀 수 있습니다.</p><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (!over || active.id === over.id) return; const oldIndex = orderedItems.findIndex((item) => item.id === active.id); const newIndex = orderedItems.findIndex((item) => item.id === over.id); const nextItems = arrayMove(orderedItems, oldIndex, newIndex); setOrderedItems(nextItems); startTransition(async () => { const result = await reorderPortfolioItems(nextItems.map((item) => item.id)); setMessage(result.success ?? result.error); }); }}><SortableContext items={orderedItems.map((item) => item.id)} strategy={verticalListSortingStrategy}><ol className="mt-4 grid gap-2">{orderedItems.map((item) => <SortableRow item={item} key={item.id} />)}</ol></SortableContext></DndContext>{pending ? <p className="mt-3 text-xs text-[var(--muted)]">순서 저장 중…</p> : null}{message ? <p className="mt-3 text-xs text-[var(--primary)]">{message}</p> : null}</div>;
}
