import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components-ui/button";
import { Input } from "@/components-ui/input";
import { Label } from "@/components-ui/label";
import { Textarea } from "@/components-ui/textarea";
import {
  deleteProduct,
  getSignedUploadUrl,
  listCategoriesForProducts,
  listProducts,
  saveProduct,
} from "@/lib/products.functions";
import { listPaymentMethods } from "@/lib/payment-methods.functions";

function getCategoryPath(id: string, all: any[]): string {
  const c = all.find((x) => x.id === id);
  if (!c) return "";
  if (!c.parent_id) return c.name;
  return getCategoryPath(c.parent_id, all) + " → " + c.name;
}

export const Route = createFileRoute("/admin/products")({
  component: ProductsPage,
});

type Img = { id?: string; image_path: string; sort_order: number };
type MaterialFile = { id?: string; file_path: string; file_name: string | null; sort_order: number };
type Product = {
  id?: string;
  category_id: string | null;
  category_ids: string[];
  name: string;
  description: string;
  keywords: string;
  price: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  file_path: string | null;
  file_name: string | null;
  file_path_kz?: string | null;
  file_name_kz?: string | null;
  file_url?: string | null;
  file_url_kz?: string | null;
  product_images?: Img[];
  product_material_files?: (MaterialFile & { language: "ru" | "kz" })[];
  country_prices?: Record<string, number>;
};

const empty: Product = {
  category_id: null,
  category_ids: [],
  name: "",
  description: "",
  keywords: "",
  price: 0,
  currency: "KZT",
  is_active: true,
  sort_order: 0,
  file_path: null,
  file_name: null,
  file_path_kz: null,
  file_name_kz: null,
  file_url: null,
  file_url_kz: null,
  product_images: [],
  country_prices: {},
};

// Карта расширений → MIME. Браузеры не знают тип для .7z и некоторых других
// архивов (отдают application/octet-stream), из-за чего Supabase с whitelist
// отклонял загрузку. Определяем тип по расширению файла.
const MIME_BY_EXT: Record<string, string> = {
  ".7z": "application/x-7z-compressed",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function mimeForFile(filename: string, fallback?: string): string {
  const ext = (filename.match(/\.[^.]+$/) || [""])[0].toLowerCase();
  return MIME_BY_EXT[ext] || fallback || "application/octet-stream";
}

async function uploadFile(file: File, bucket: "product-images" | "product-files") {
  // 1. Получаем одноразовую ссылку для прямой загрузки от сервера
  const { path, name, signedUrl } = await getSignedUploadUrl({ data: { bucket, filename: file.name } });

  // 2. Грузим файл напрямую в Supabase в обход лимитов Vercel.
  // Для файлов товаров определяем Content-Type по расширению (надёжнее, чем
  // file.type, который пуст для .7z). Для картинок доверяем типу браузера.
  const contentType =
    bucket === "product-files" ? mimeForFile(file.name, file.type) : file.type || "application/octet-stream";

  const resUpload = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": contentType,
    },
  });
  if (!resUpload.ok) {
    const body = await resUpload.text();
    throw new Error(body || `Upload failed HTTP ${resUpload.status}`);
  }

  return { path, name };
}

function MaterialFilesList({ files, onRemove }: { files: MaterialFile[]; onRemove: (idx: number) => void }) {
  if (files.length === 0) return null;
  return (
    <ul className="text-sm space-y-1 mt-1">
      {files.map((f, idx) => (
        <li key={`${f.file_path}-${idx}`} className="flex items-center justify-between gap-2 text-muted-foreground">
          <span className="truncate">📎 {f.file_name || f.file_path}</span>
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="shrink-0 text-destructive hover:underline"
          >
            Убрать
          </button>
        </li>
      ))}
    </ul>
  );
}

function ProductsPage() {
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ["products"], queryFn: () => listProducts() });
  const cats = useQuery({ queryKey: ["cats-flat"], queryFn: () => listCategoriesForProducts() });
  
  const pMethods = useQuery({
    queryKey: ["payment-methods-admin"],
    queryFn: () => listPaymentMethods(),
  });

  const list = (products.data ?? []) as any[];
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [images, setImages] = useState<Img[]>([]);
  const [materialFilesRu, setMaterialFilesRu] = useState<MaterialFile[]>([]);
  const [materialFilesKz, setMaterialFilesKz] = useState<MaterialFile[]>([]);
  const [saving, setSaving] = useState(false);

  // Клиентская фильтрация по названию / ключевым словам / описанию.
  // 300+ товаров обрабатываются мгновенно, бэкенд-поиск не требуется.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => {
      const hay = [p.name, p.keywords, p.description].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [list, search]);

  function startNew() {
    setEditing({ ...empty });
    setImages([]);
    setMaterialFilesRu([]);
    setMaterialFilesKz([]);
  }
  function startEdit(p: any) {
    setEditing({
      id: p.id,
      category_id: p.category_id,
      category_ids: p.category_ids || (p.category_id ? [p.category_id] : []),
      name: p.name,
      description: p.description ?? "",
      keywords: p.keywords ?? "",
      price: Number(p.price),
      currency: p.currency,
      is_active: p.is_active,
      sort_order: p.sort_order,
      file_path: p.file_path,
      file_name: p.file_name,
      file_path_kz: p.file_path_kz,
      file_name_kz: p.file_name_kz,
      file_url: p.file_url,
      file_url_kz: p.file_url_kz,
      country_prices: p.country_prices || {},
    });
    const imgs = (p.product_images ?? []).slice().sort((a: Img, b: Img) => a.sort_order - b.sort_order);
    setImages(imgs);

    const materialRows = (p.product_material_files ?? []) as (MaterialFile & { language: "ru" | "kz" })[];
    const ru = materialRows.filter((f) => f.language === "ru").sort((a, b) => a.sort_order - b.sort_order);
    const kz = materialRows.filter((f) => f.language === "kz").sort((a, b) => a.sort_order - b.sort_order);
    // Products saved before multi-file materials existed only have the
    // single legacy file_path column — show that as one item so it stays
    // visible/editable instead of silently disappearing from the list.
    setMaterialFilesRu(ru.length ? ru : p.file_path ? [{ file_path: p.file_path, file_name: p.file_name, sort_order: 0 }] : []);
    setMaterialFilesKz(kz.length ? kz : p.file_path_kz ? [{ file_path: p.file_path_kz, file_name: p.file_name_kz, sort_order: 0 }] : []);
  }

  async function onImagesChange(files: FileList | null) {
    if (!files) return;
    const uploaded: Img[] = [];
    try {
      for (const f of Array.from(files)) {
        const r = await uploadFile(f, "product-images");
        uploaded.push({ image_path: r.path, sort_order: images.length + uploaded.length });
      }
      setImages([...images, ...uploaded]);
    } catch (e: any) {
      alert("Ошибка загрузки фото: " + e.message);
    }
  }

  async function onMaterialFilesChange(files: FileList | null, lang: "ru" | "kz") {
    if (!files) return;
    const setList = lang === "ru" ? setMaterialFilesRu : setMaterialFilesKz;
    const current = lang === "ru" ? materialFilesRu : materialFilesKz;
    const uploaded: MaterialFile[] = [];
    try {
      for (const f of Array.from(files)) {
        const r = await uploadFile(f, "product-files");
        uploaded.push({ file_path: r.path, file_name: r.name, sort_order: current.length + uploaded.length });
      }
      setList([...current, ...uploaded]);
    } catch (e: any) {
      alert(`Ошибка загрузки файла${lang === "kz" ? " (KZ)" : ""}: ${e.message}`);
    }
  }

  async function onSave() {
    if (!editing) return;
    if (!editing.name.trim()) {
      alert("Укажите название товара");
      return;
    }
    setSaving(true);
    try {
      await saveProduct({
        data: {
          id: editing.id,
          category_id: editing.category_id,
          category_ids: editing.category_ids,
          name: editing.name,
          description: editing.description,
          keywords: editing.keywords,
          price: Number(editing.price),
          currency: editing.currency,
          is_active: editing.is_active,
          sort_order: Number(editing.sort_order),
          // The multi-file uploader below is now the source of truth for the
          // deliverable — legacy single-file columns are cleared on save.
          file_path: null,
          file_name: null,
          file_path_kz: null,
          file_name_kz: null,
          file_url: editing.file_url,
          file_url_kz: editing.file_url_kz,
          image_paths: images.map((i) => i.image_path),
          material_files_ru: materialFilesRu.map((f) => ({ file_path: f.file_path, file_name: f.file_name })),
          material_files_kz: materialFilesKz.map((f) => ({ file_path: f.file_path, file_name: f.file_name })),
          country_prices: editing.country_prices,
        },
      });
      setEditing(null);
      setImages([]);
      setMaterialFilesRu([]);
      setMaterialFilesKz([]);
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e: any) {
      alert("Ошибка сохранения: " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Удалить товар?")) return;
    await deleteProduct({ data: { id } });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Товары</h1>
        {!editing && <Button onClick={startNew}>+ Новый товар</Button>}
      </div>

      {editing ? (
        <div className="bg-card border rounded-lg p-4 space-y-4">
          <h2 className="font-medium">{editing.id ? "Редактирование товара" : "Новый товар"}</h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Название</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Категории (можно выбрать несколько)</Label>
              <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1 bg-background text-sm">
                {(cats.data ?? []).map((c: any) => (
                  <label key={c.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editing.category_ids.includes(c.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditing({ ...editing, category_ids: [...editing.category_ids, c.id] });
                        } else {
                          setEditing({
                            ...editing,
                            category_ids: editing.category_ids.filter((id) => id !== c.id),
                          });
                        }
                      }}
                    />
                    {getCategoryPath(c.id, cats.data ?? [])}
                  </label>
                ))}
                {(!cats.data || cats.data.length === 0) && (
                  <div className="text-muted-foreground text-xs">Нет доступных категорий</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Описание</Label>
            <Textarea
              rows={4}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Ключевые слова (для поиска, через пробел или запятую)</Label>
            <Input
              value={editing.keywords}
              onChange={(e) => setEditing({ ...editing, keywords: e.target.value })}
            />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Цена</Label>
              <Input
                type="number"
                value={editing.price}
                onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Валюта</Label>
              <Input
                value={editing.currency}
                onChange={(e) => setEditing({ ...editing, currency: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Порядок</Label>
              <Input
                type="number"
                value={editing.sort_order}
                onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div>
              <h3 className="font-medium">Цены для разных стран (вручную)</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Если оставить поле пустым — будет работать автоматическая конвертация базовой цены.
              </p>
            </div>
            {pMethods.isLoading ? (
              <p className="text-xs text-muted-foreground">Загрузка стран...</p>
            ) : (pMethods.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Сначала добавьте реквизиты в разделе «Реквизиты по странам».</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {(pMethods.data ?? []).map((m: any) => (
                  <div key={m.country_code} className="space-y-1">
                    <Label className="text-xs">{m.country_name} ({m.currency})</Label>
                    <Input
                      type="number"
                      placeholder="Авто (по курсу)"
                      value={editing.country_prices?.[m.country_code] || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        const cp = { ...(editing.country_prices || {}) };
                        if (val === "") {
                          delete cp[m.country_code];
                        } else {
                          cp[m.country_code] = Number(val);
                        }
                        setEditing({ ...editing, country_prices: cp });
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-4 border-t">
            <Label>Фото (можно несколько)</Label>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onImagesChange(e.target.files)}
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {images.map((im, idx) => (
                <div key={im.image_path} className="relative">
                  <img
                    src={`/api/public/img/${im.image_path}`}
                    alt=""
                    className="w-20 h-20 object-cover rounded border"
                  />
                  <button
                    type="button"
                    onClick={() => setImages(images.filter((_, i) => i !== idx))}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>



          <div className="space-y-2 pt-4 border-t">
            <Label htmlFor="file-ru">📄 Материал (Русский) — можно несколько файлов/фото</Label>
            <Input id="file-ru" type="file" multiple onChange={(e) => onMaterialFilesChange(e.target.files, "ru")} />
            <MaterialFilesList files={materialFilesRu} onRemove={(idx) => setMaterialFilesRu(materialFilesRu.filter((_, i) => i !== idx))} />
            <div className="pt-2">
              <Label>Или внешняя ссылка на файл (Русский)</Label>
              <Input
                value={editing.file_url || ""}
                onChange={(e) => setEditing({ ...editing, file_url: e.target.value || null })}
                placeholder="https://drive.google.com/..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ссылка используется, только если выше не загружено ни одного файла.
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t">
            <Label htmlFor="file-kz">📄 Материал (Қазақша) — можно несколько файлов/фото</Label>
            <Input id="file-kz" type="file" multiple onChange={(e) => onMaterialFilesChange(e.target.files, "kz")} />
            <MaterialFilesList files={materialFilesKz} onRemove={(idx) => setMaterialFilesKz(materialFilesKz.filter((_, i) => i !== idx))} />
            <div className="pt-2">
              <Label>Или внешняя ссылка на файл (Қазақша)</Label>
              <Input
                value={editing.file_url_kz || ""}
                onChange={(e) => setEditing({ ...editing, file_url_kz: e.target.value || null })}
                placeholder="https://drive.google.com/..."
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Если загрузить материал только на русском, бот не будет спрашивать язык при выдаче заказа.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editing.is_active}
              onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
            />
            Показывать в боте
          </label>

          <div className="flex gap-2">
            <Button onClick={onSave} disabled={saving}>
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <>
        <div className="bg-card border rounded-lg p-4 space-y-3">
          <Label>🔍 Поиск по материалам</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название, ключевое слово или описание…"
          />
          <p className="text-xs text-muted-foreground">
            Найдено: {filtered.length} из {list.length}
          </p>
        </div>
        <div className="bg-card border rounded-lg divide-y">
          {filtered.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              {list.length === 0 ? "Пока нет товаров." : "Ничего не найдено."}
            </div>
          )}
          {filtered.map((p) => (
            <div key={p.id} className="p-3 flex items-center gap-3">
              {p.product_images?.[0] ? (
                <img
                  src={`/api/public/img/${p.product_images[0].image_path}`}
                  className="w-12 h-12 object-cover rounded border shrink-0"
                  alt=""
                />
              ) : (
                <div className="w-12 h-12 bg-muted rounded shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {p.name} {!p.is_active && <span className="text-xs text-muted-foreground">(скрыт)</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.category_ids && p.category_ids.length > 0
                    ? p.category_ids
                        .map((id: string) => getCategoryPath(id, cats.data ?? []))
                        .filter(Boolean)
                        .join(", ") || "без категории"
                    : p.categories?.name || "без категории"} · {p.price} {p.currency}
                  {(() => {
                    const materials = (p.product_material_files ?? []) as { language: "ru" | "kz" }[];
                    const hasRu = materials.some((f) => f.language === "ru") || !!p.file_path || !!p.file_url;
                    const hasKz = materials.some((f) => f.language === "kz") || !!p.file_path_kz || !!p.file_url_kz;
                    if (!hasRu && !hasKz) return <span className="text-destructive"> · нет файла</span>;
                    if (hasRu && hasKz) return <span className="text-green-500"> · 🇷🇺🇰🇿</span>;
                    if (hasRu) return <span className="text-muted-foreground"> · 🇷🇺</span>;
                    return <span className="text-muted-foreground"> · 🇰🇿</span>;
                  })()}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => startEdit(p)}>
                  Изм.
                </Button>
                <Button size="sm" variant="destructive" onClick={() => onDelete(p.id)}>
                  Удал.
                </Button>
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}