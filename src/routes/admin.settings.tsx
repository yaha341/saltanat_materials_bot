import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components-ui/button";
import { Input } from "@/components-ui/input";
import { Label } from "@/components-ui/label";
import { Checkbox } from "@/components-ui/checkbox";
import { getSettings, saveSetting } from "@/lib/settings.functions";
import { resetAllData } from "@/lib/reset.functions";

const DEVELOPER_ID = "7256670713";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => getSettings() });
  const [adminChatId, setAdminChatId] = useState("");
  const [adminContactLink, setAdminContactLink] = useState("");
  const [saved, setSaved] = useState(false);

  // Owner ID — editable field
  const [ownerIdInput, setOwnerIdInput] = useState("");
  const [ownerIdSaved, setOwnerIdSaved] = useState("");
  const [ownerSaveMsg, setOwnerSaveMsg] = useState(false);

  useEffect(() => {
    const chatId = settings.data?.admin_chat_id ?? "";
    setAdminChatId(chatId);
    setAdminContactLink(settings.data?.admin_contact_link ?? "");
    const ownerId = settings.data?.owner_chat_id ?? "";
    setOwnerIdSaved(ownerId);
    setOwnerIdInput(ownerId);
  }, [settings.data]);

  const ids = adminChatId.split(",").map((s) => s.trim()).filter(Boolean);

  function toggleId(id: string, checked: boolean) {
    let newIds = [...ids];
    if (checked) {
      if (!newIds.includes(id)) newIds.push(id);
    } else {
      newIds = newIds.filter((i) => i !== id);
    }
    setAdminChatId(newIds.join(", "));
  }

  async function saveOwnerIdField() {
    const trimmed = ownerIdInput.trim();
    await saveSetting({ data: { key: "owner_chat_id", value: trimmed } });
    // If owner was active with old ID — replace with new
    if (ownerIdSaved && ids.includes(ownerIdSaved)) {
      const newIds = ids.filter((i) => i !== ownerIdSaved);
      if (trimmed) newIds.push(trimmed);
      setAdminChatId(newIds.join(", "));
    }
    setOwnerIdSaved(trimmed);
    setOwnerSaveMsg(true);
    setTimeout(() => setOwnerSaveMsg(false), 2000);
  }

  async function onSave() {
    await saveSetting({ data: { key: "admin_chat_id", value: adminChatId.trim() } });
    await saveSetting({ data: { key: "admin_contact_link", value: adminContactLink.trim() } });
    qc.invalidateQueries({ queryKey: ["settings"] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  async function onReset() {
    const ok = window.confirm(
      "Сбросить ВСЕ данные? Будут удалены все товары, категории, заказы и загруженные файлы. Действие необратимо.",
    );
    if (!ok) return;
    const ok2 = window.confirm("Точно? Это нельзя отменить.");
    if (!ok2) return;
    setResetting(true);
    try {
      await resetAllData();
      await qc.invalidateQueries();
      setResetDone(true);
      setTimeout(() => setResetDone(false), 3000);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Настройки</h1>

      <div className="bg-card border rounded-lg p-4 space-y-4">
        <Label>Получатели уведомлений о заказах (Telegram ID)</Label>

        {/* Владелец — редактируемый */}
        <div className="space-y-2 border rounded-md p-3 bg-muted/30">
          <p className="text-sm font-medium">👤 Владелец</p>
          <div className="flex gap-2 items-center">
            <Input
              value={ownerIdInput}
              onChange={(e) => setOwnerIdInput(e.target.value)}
              placeholder="Введите Telegram ID владельца"
              className="flex-1"
            />
            <Button size="sm" variant="outline" onClick={saveOwnerIdField}>
              Сохранить
            </Button>
            {ownerSaveMsg && <span className="text-xs text-green-600">✓</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            Узнать свой ID можно у бота <b>@userinfobot</b> в Telegram.
          </p>
          {ownerIdSaved && (
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
              <Checkbox
                checked={ids.includes(ownerIdSaved)}
                onCheckedChange={(c) => toggleId(ownerIdSaved, !!c)}
              />
              <span>
                Получать уведомления{" "}
                <span className="text-muted-foreground">({ownerIdSaved})</span>
              </span>
            </label>
          )}
        </div>

        {/* Разработчик — фиксированный */}
        <div className="border rounded-md p-3 bg-muted/30">
          <p className="text-sm font-medium mb-2">🛠 Разработчик</p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={ids.includes(DEVELOPER_ID)}
              onCheckedChange={(c) => toggleId(DEVELOPER_ID, !!c)}
            />
            <span>
              Получать уведомления{" "}
              <span className="text-muted-foreground">({DEVELOPER_ID})</span>
            </span>
          </label>
        </div>

        <div className="space-y-2 pt-2 border-t border-border/50">
          <Label>Ваш контакт для связи (кнопка в боте)</Label>
          <Input
            value={adminContactLink}
            onChange={(e) => setAdminContactLink(e.target.value)}
            placeholder="например, @my_username или ссылка на WhatsApp"
          />
          <p className="text-xs text-muted-foreground">
            Эта ссылка или текст будет показываться пользователям при нажатии на кнопку «💬 Связаться с автором».
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={onSave}>Сохранить</Button>
          {saved && <span className="text-sm text-green-600">Сохранено ✓</span>}
        </div>
      </div>

      <div className="bg-card border rounded-lg p-4 space-y-1 text-sm">
        <h2 className="font-medium mb-2">Доступ в админ-панель</h2>
        <p>Логин и пароль: <code>admin</code> / <code>admin</code></p>
        <p className="text-muted-foreground">
          Для смены — обратитесь к разработчику или измените секреты <code>ADMIN_USERNAME</code> и
          <code> ADMIN_PASSWORD</code> в настройках проекта.
        </p>
      </div>

      <div className="bg-card border border-destructive/40 rounded-lg p-4 space-y-3">
        <h2 className="font-medium text-destructive">Опасная зона</h2>
        <p className="text-sm text-muted-foreground">
          Полный сброс: удалит все товары, категории, изображения, файлы товаров, заказы,
          корзины пользователей и скриншоты оплаты. Счётчики обнулятся. Настройки и реквизиты
          оплаты сохранятся.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="destructive" onClick={onReset} disabled={resetting}>
            {resetting ? "Сбрасываю..." : "Сбросить все данные"}
          </Button>
          {resetDone && <span className="text-sm text-green-600">Готово ✓</span>}
        </div>
      </div>
    </div>
  );
}