import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components-ui/button";
import { Input } from "@/components-ui/input";
import { Label } from "@/components-ui/label";
import { Textarea } from "@/components-ui/textarea";
import {
  deletePaymentMethod,
  listPaymentMethods,
  savePaymentMethod,
} from "@/lib/payment-methods.functions";
import { getSignedUploadUrl } from "@/lib/products.functions";

export const Route = createFileRoute("/admin/payment-methods")({
  component: PaymentMethodsPage,
});

type PM = {
  id?: string;
  country_code: string;
  country_name: string;
  currency: string;
  instructions: string;
  sort_order: number;
  is_active: boolean;
  qr_code_path?: string | null;
};

const empty: PM = {
  country_code: "",
  country_name: "",
  currency: "KZT",
  instructions: "",
  sort_order: 0,
  is_active: true,
  qr_code_path: null,
};

async function uploadFile(file: File) {
  const { path, name, signedUrl } = await getSignedUploadUrl({ data: { bucket: "product-images", filename: file.name } });
  const contentType = file.type || "application/octet-stream";
  const resUpload = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": contentType },
  });
  if (!resUpload.ok) throw new Error(await resUpload.text());
  return { path, name };
}

function PaymentMethodsPage() {
  const qc = useQueryClient();
  const methods = useQuery({ queryKey: ["payment-methods"], queryFn: () => listPaymentMethods() });
  const list = (methods.data ?? []) as PM[];
  const [editing, setEditing] = useState<PM | null>(null);

  async function onQrChange(file: File | null) {
    if (!file) return;
    try {
      const r = await uploadFile(file);
      setEditing((prev) => prev ? { ...prev, qr_code_path: r.path } : prev);
    } catch (e: any) {
      alert("Ошибка загрузки QR-кода: " + e.message);
    }
  }

  async function onSave() {
    if (!editing) return;
    try {
      await savePaymentMethod({ data: editing });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["payment-methods"] });
    } catch (e: any) {
      alert("Ошибка при сохранении: " + e.message);
    }
  }
  async function onDelete(id: string) {
    if (!confirm("Удалить способ оплаты?")) return;
    await deletePaymentMethod({ data: { id } });
    qc.invalidateQueries({ queryKey: ["payment-methods"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Реквизиты по странам</h1>
        {!editing && <Button onClick={() => setEditing({ ...empty })}>+ Добавить</Button>}
      </div>

      {editing && (
        <div className="bg-card border rounded-lg p-4 space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Код страны</Label>
              <Input
                value={editing.country_code}
                onChange={(e) => setEditing({ ...editing, country_code: e.target.value.toUpperCase() })}
                placeholder="KZ, RU, KG..."
              />
            </div>
            <div className="space-y-2">
              <Label>Название (как будет в боте)</Label>
              <Input
                value={editing.country_name}
                onChange={(e) => setEditing({ ...editing, country_name: e.target.value })}
                placeholder="🇰🇿 Казахстан"
              />
            </div>
            <div className="space-y-2">
              <Label>Валюта</Label>
              <Input
                value={editing.currency}
                onChange={(e) => setEditing({ ...editing, currency: e.target.value.toUpperCase() })}
                placeholder="KZT, RUB, KGS, BYN, USD..."
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Инструкция для оплаты (что увидит покупатель)</Label>
            <Textarea
              rows={6}
              value={editing.instructions}
              onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
              placeholder="Kaspi: +7 XXX...&#10;Halyk: ..."
            />
          </div>
          <div className="space-y-2">
            <Label>QR-код для оплаты (опционально)</Label>
            <Input type="file" accept="image/*" onChange={(e) => onQrChange(e.target.files?.[0] ?? null)} />
            {editing.qr_code_path && (
              <div className="mt-2 relative inline-block">
                <img
                  src={`/api/public/img/${editing.qr_code_path}`}
                  alt="QR"
                  className="w-32 h-32 object-cover rounded border"
                />
                <button
                  type="button"
                  onClick={() => setEditing({ ...editing, qr_code_path: null })}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 text-xs"
                >
                  ×
                </button>
              </div>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Порядок</Label>
              <Input
                type="number"
                value={editing.sort_order}
                onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm pt-7">
              <input
                type="checkbox"
                checked={editing.is_active}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
              />
              Активен
            </label>
          </div>
          <div className="flex gap-2">
            <Button onClick={onSave}>Сохранить</Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      <div className="bg-card border rounded-lg divide-y">
        {list.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">Нет способов оплаты.</div>
        )}
        {list.map((m) => (
          <div key={m.id} className="p-3 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium">
                {m.country_name} <span className="text-xs text-muted-foreground">[{m.country_code}]</span>
                <span className="text-xs text-muted-foreground"> · {m.currency}</span>
                {!m.is_active && <span className="text-xs text-muted-foreground"> · скрыт</span>}
              </div>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap mt-1 font-sans">
                {m.instructions}
              </pre>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="outline" onClick={() => setEditing(m)}>
                Изм.
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onDelete(m.id!)}>
                Удал.
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}