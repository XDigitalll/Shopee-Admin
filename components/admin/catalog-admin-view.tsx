"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { AdminBanner, AdminListLoadingOverlay } from "@/components/admin/feedback-state";
import { adminApiFetch } from "@/lib/admin/api-client";
import type { CatalogPage, CatalogProduct, CatalogPromotion, CatalogTaxonomy } from "@/lib/admin/catalog-types";

type Mode = "products" | "categories" | "brands" | "promotions";
type Feedback = { tone: "success" | "error"; message: string } | null;

const emptyProduct = {
  name: "",
  shortDescription: "",
  description: "",
  categoryId: "",
  brandId: "",
  promotionId: "",
  supplier: "",
  supplierLink: "",
  currency: "ZAR",
  supplierPrice: "",
  exchangeRateSnapshot: "",
  shippingCost: "",
  customsCost: "",
  commissionValue: "",
  finalPrice: "",
  weight: "",
  estimatedDeadline: "",
  active: true,
  featured: false,
  newProduct: false,
  bestSeller: false,
  recommended: true,
  seoTitle: "",
  seoDescription: "",
  specificationsText: "",
};

type ProductForm = typeof emptyProduct & { id?: number };
type TaxonomyForm = { id?: number; name: string; slug: string; description: string; active: boolean; displayOrder: string };
type PromotionForm = { id?: number; name: string; slug: string; description: string; discountPercent: string; startsAt: string; endsAt: string; active: boolean };
const primaryButton = "inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#E8431A] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#CC3315] disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton = "inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-[#E8431A]/40 hover:text-[#E8431A]";

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function specsFromText(text: string) {
  return text.split("\n").reduce<Record<string, string>>((acc, line) => {
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (key?.trim() && value) acc[key.trim()] = value;
    return acc;
  }, {});
}

function specsToText(specs?: Record<string, string>) {
  return Object.entries(specs || {}).map(([key, value]) => `${key}: ${value}`).join("\n");
}

export function CatalogAdminView({ mode }: { mode: Mode }) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogTaxonomy[]>([]);
  const [brands, setBrands] = useState<CatalogTaxonomy[]>([]);
  const [promotions, setPromotions] = useState<CatalogPromotion[]>([]);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [taxonomyForm, setTaxonomyForm] = useState<TaxonomyForm>({ name: "", slug: "", description: "", active: true, displayOrder: "0" });
  const [promotionForm, setPromotionForm] = useState<PromotionForm>({ name: "", slug: "", description: "", discountPercent: "", startsAt: "", endsAt: "", active: true });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [uploadingProductId, setUploadingProductId] = useState<number | null>(null);

  const title = useMemo(() => ({
    products: "Produtos do catalogo",
    categories: "Categorias do catalogo",
    brands: "Marcas do catalogo",
    promotions: "Promocoes do catalogo",
  }[mode]), [mode]);

  async function load() {
    setLoading(true);
    setFeedback(null);
    try {
      const [productPage, categoryList, brandList, promotionList] = await Promise.all([
        adminApiFetch<CatalogPage<CatalogProduct>>(`/api/admin/catalog/products?size=80${search ? `&search=${encodeURIComponent(search)}` : ""}`),
        adminApiFetch<CatalogTaxonomy[]>("/api/admin/catalog/categories"),
        adminApiFetch<CatalogTaxonomy[]>("/api/admin/catalog/brands"),
        adminApiFetch<CatalogPromotion[]>("/api/admin/catalog/promotions"),
      ]);
      setProducts(productPage.content || []);
      setCategories(categoryList || []);
      setBrands(brandList || []);
      setPromotions(promotionList || []);
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel carregar o catalogo." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [mode]);

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const payload = {
      name: productForm.name,
      shortDescription: productForm.shortDescription || null,
      description: productForm.description || null,
      categoryId: productForm.categoryId ? Number(productForm.categoryId) : null,
      brandId: productForm.brandId ? Number(productForm.brandId) : null,
      promotionId: productForm.promotionId ? Number(productForm.promotionId) : null,
      supplier: productForm.supplier || null,
      supplierLink: productForm.supplierLink,
      currency: productForm.currency,
      supplierPrice: Number(productForm.supplierPrice || 0),
      exchangeRateSnapshot: productForm.exchangeRateSnapshot ? Number(productForm.exchangeRateSnapshot) : null,
      shippingCost: productForm.shippingCost ? Number(productForm.shippingCost) : null,
      customsCost: productForm.customsCost ? Number(productForm.customsCost) : null,
      commissionValue: productForm.commissionValue ? Number(productForm.commissionValue) : null,
      finalPrice: Number(productForm.finalPrice || 0),
      weight: productForm.weight ? Number(productForm.weight) : null,
      estimatedDeadline: productForm.estimatedDeadline || null,
      active: productForm.active,
      featured: productForm.featured,
      newProduct: productForm.newProduct,
      bestSeller: productForm.bestSeller,
      recommended: productForm.recommended,
      seoTitle: productForm.seoTitle || null,
      seoDescription: productForm.seoDescription || null,
      specifications: specsFromText(productForm.specificationsText),
    };
    try {
      await adminApiFetch(`/api/admin/catalog/products${productForm.id ? `/${productForm.id}` : ""}`, {
        method: productForm.id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setProductForm(emptyProduct);
      setFeedback({ tone: "success", message: "Produto guardado." });
      await load();
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel guardar o produto." });
    } finally {
      setSaving(false);
    }
  }

  async function saveTaxonomy(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const endpoint = mode === "categories" ? "categories" : "brands";
    const payload = {
      name: taxonomyForm.name,
      slug: taxonomyForm.slug || null,
      description: taxonomyForm.description || null,
      active: taxonomyForm.active,
      displayOrder: Number(taxonomyForm.displayOrder || 0),
    };
    try {
      await adminApiFetch(`/api/admin/catalog/${endpoint}${taxonomyForm.id ? `/${taxonomyForm.id}` : ""}`, {
        method: taxonomyForm.id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setTaxonomyForm({ name: "", slug: "", description: "", active: true, displayOrder: "0" });
      setFeedback({ tone: "success", message: "Registo guardado." });
      await load();
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel guardar." });
    } finally {
      setSaving(false);
    }
  }

  async function savePromotion(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await adminApiFetch(`/api/admin/catalog/promotions${promotionForm.id ? `/${promotionForm.id}` : ""}`, {
        method: promotionForm.id ? "PUT" : "POST",
        body: JSON.stringify({
          name: promotionForm.name,
          slug: promotionForm.slug || null,
          description: promotionForm.description || null,
          discountPercent: promotionForm.discountPercent ? Number(promotionForm.discountPercent) : null,
          startsAt: promotionForm.startsAt || null,
          endsAt: promotionForm.endsAt || null,
          active: promotionForm.active,
        }),
      });
      setPromotionForm({ name: "", slug: "", description: "", discountPercent: "", startsAt: "", endsAt: "", active: true });
      setFeedback({ tone: "success", message: "Promocao guardada." });
      await load();
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel guardar a promocao." });
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(endpoint: string, id: number) {
    if (!window.confirm("Remover este registo?")) return;
    try {
      await adminApiFetch(`/api/admin/catalog/${endpoint}/${id}`, { method: "DELETE" });
      await load();
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel remover." });
    }
  }

  async function uploadImages(productId: number, files: FileList | null) {
    if (!files?.length) return;
    setUploadingProductId(productId);
    const body = new FormData();
    Array.from(files).forEach((file) => body.append("files", file));
    try {
      await adminApiFetch(`/api/admin/catalog/products/${productId}/images`, { method: "POST", body });
      await load();
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel enviar imagens." });
    } finally {
      setUploadingProductId(null);
    }
  }

  function editProduct(product: CatalogProduct) {
    setProductForm({
      ...emptyProduct,
      id: product.id,
      name: product.name,
      shortDescription: product.shortDescription || "",
      description: product.description || "",
      categoryId: product.category?.id ? String(product.category.id) : "",
      brandId: product.brand?.id ? String(product.brand.id) : "",
      promotionId: product.promotion?.id ? String(product.promotion.id) : "",
      supplier: product.supplier || "",
      supplierLink: product.supplierLink || "",
      currency: product.currency || "ZAR",
      supplierPrice: String(product.supplierPrice || ""),
      exchangeRateSnapshot: String(product.exchangeRateSnapshot || ""),
      shippingCost: String(product.shippingCost || ""),
      customsCost: String(product.customsCost || ""),
      commissionValue: String(product.commissionValue || ""),
      finalPrice: String(product.finalPrice || ""),
      weight: String(product.weight || ""),
      estimatedDeadline: product.estimatedDeadline || "",
      active: product.active,
      featured: product.featured,
      newProduct: product.newProduct,
      bestSeller: product.bestSeller,
      recommended: product.recommended,
      seoTitle: product.seoTitle || "",
      seoDescription: product.seoDescription || "",
      specificationsText: specsToText(product.specifications),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const taxonomyItems = mode === "categories" ? categories : brands;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8431A]">Escolhas da ShopeeMz</p>
          <h1 className="font-[family-name:var(--font-sora)] text-2xl font-semibold text-slate-950">{title}</h1>
        </div>
        {mode === "products" ? (
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void load(); }}>
            <input className="admin-input min-w-0 sm:w-72" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar produto, marca, fornecedor" />
            <button className={primaryButton} type="submit">Pesquisar</button>
          </form>
        ) : null}
      </div>

      {feedback ? <AdminBanner tone={feedback.tone} message={feedback.message} /> : null}

      {mode === "products" ? (
        <form onSubmit={saveProduct} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <input className="admin-input" required placeholder="Nome" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
            <input className="admin-input" required placeholder="Link do fornecedor" value={productForm.supplierLink} onChange={(e) => setProductForm({ ...productForm, supplierLink: e.target.value })} />
            <input className="admin-input" placeholder="Fornecedor" value={productForm.supplier} onChange={(e) => setProductForm({ ...productForm, supplier: e.target.value })} />
            <select className="admin-input" value={productForm.categoryId} onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })}><option value="">Categoria</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select className="admin-input" value={productForm.brandId} onChange={(e) => setProductForm({ ...productForm, brandId: e.target.value })}><option value="">Marca</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select className="admin-input" value={productForm.promotionId} onChange={(e) => setProductForm({ ...productForm, promotionId: e.target.value })}><option value="">Promocao</option>{promotions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <input className="admin-input" required placeholder="Moeda" value={productForm.currency} onChange={(e) => setProductForm({ ...productForm, currency: e.target.value.toUpperCase() })} />
            <input className="admin-input" required type="number" step="0.01" placeholder="Preco fornecedor" value={productForm.supplierPrice} onChange={(e) => setProductForm({ ...productForm, supplierPrice: e.target.value })} />
            <input className="admin-input" required type="number" step="0.01" placeholder="Preco final MZN" value={productForm.finalPrice} onChange={(e) => setProductForm({ ...productForm, finalPrice: e.target.value })} />
            <input className="admin-input" type="number" step="0.000001" placeholder="Cambio snapshot" value={productForm.exchangeRateSnapshot} onChange={(e) => setProductForm({ ...productForm, exchangeRateSnapshot: e.target.value })} />
            <input className="admin-input" type="number" step="0.01" placeholder="Frete" value={productForm.shippingCost} onChange={(e) => setProductForm({ ...productForm, shippingCost: e.target.value })} />
            <input className="admin-input" type="number" step="0.01" placeholder="Alfandega" value={productForm.customsCost} onChange={(e) => setProductForm({ ...productForm, customsCost: e.target.value })} />
            <input className="admin-input" type="number" step="0.01" placeholder="Comissao" value={productForm.commissionValue} onChange={(e) => setProductForm({ ...productForm, commissionValue: e.target.value })} />
            <input className="admin-input" type="number" step="0.01" placeholder="Peso" value={productForm.weight} onChange={(e) => setProductForm({ ...productForm, weight: e.target.value })} />
            <input className="admin-input" placeholder="Prazo estimado" value={productForm.estimatedDeadline} onChange={(e) => setProductForm({ ...productForm, estimatedDeadline: e.target.value })} />
          </div>
          <textarea className="admin-input mt-3 w-full" rows={2} placeholder="Descricao curta" value={productForm.shortDescription} onChange={(e) => setProductForm({ ...productForm, shortDescription: e.target.value })} />
          <textarea className="admin-input mt-3 w-full" rows={4} placeholder="Descricao completa" value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
          <textarea className="admin-input mt-3 w-full" rows={3} placeholder={"Especificacoes, uma por linha: chave: valor"} value={productForm.specificationsText} onChange={(e) => setProductForm({ ...productForm, specificationsText: e.target.value })} />
          <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-slate-700">
            {(["active", "featured", "newProduct", "bestSeller", "recommended"] as const).map((key) => (
              <label key={key} className="inline-flex items-center gap-2"><input type="checkbox" checked={Boolean(productForm[key])} onChange={(e) => setProductForm({ ...productForm, [key]: e.target.checked })} />{key}</label>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={saving} className={primaryButton}>{saving ? "A guardar..." : productForm.id ? "Guardar produto" : "Criar produto"}</button>
            {productForm.id ? <button type="button" className={secondaryButton} onClick={() => setProductForm(emptyProduct)}>Cancelar edicao</button> : null}
          </div>
        </form>
      ) : null}

      {mode === "categories" || mode === "brands" ? (
        <form onSubmit={saveTaxonomy} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <input className="admin-input" required placeholder="Nome" value={taxonomyForm.name} onChange={(e) => setTaxonomyForm({ ...taxonomyForm, name: e.target.value })} />
            <input className="admin-input" placeholder="Slug automatico" value={taxonomyForm.slug} onChange={(e) => setTaxonomyForm({ ...taxonomyForm, slug: e.target.value })} />
            <input className="admin-input" placeholder="Descricao" value={taxonomyForm.description} onChange={(e) => setTaxonomyForm({ ...taxonomyForm, description: e.target.value })} />
            <input className="admin-input" type="number" placeholder="Ordem" value={taxonomyForm.displayOrder} onChange={(e) => setTaxonomyForm({ ...taxonomyForm, displayOrder: e.target.value })} />
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={taxonomyForm.active} onChange={(e) => setTaxonomyForm({ ...taxonomyForm, active: e.target.checked })} />Activo</label>
          <button type="submit" disabled={saving} className={`${primaryButton} mt-3`}>{saving ? "A guardar..." : "Guardar"}</button>
        </form>
      ) : null}

      {mode === "promotions" ? (
        <form onSubmit={savePromotion} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <input className="admin-input" required placeholder="Nome" value={promotionForm.name} onChange={(e) => setPromotionForm({ ...promotionForm, name: e.target.value })} />
            <input className="admin-input" placeholder="Slug automatico" value={promotionForm.slug} onChange={(e) => setPromotionForm({ ...promotionForm, slug: e.target.value })} />
            <input className="admin-input" type="number" step="0.01" placeholder="Desconto %" value={promotionForm.discountPercent} onChange={(e) => setPromotionForm({ ...promotionForm, discountPercent: e.target.value })} />
            <input className="admin-input" type="date" value={promotionForm.startsAt} onChange={(e) => setPromotionForm({ ...promotionForm, startsAt: e.target.value })} />
            <input className="admin-input" type="date" value={promotionForm.endsAt} onChange={(e) => setPromotionForm({ ...promotionForm, endsAt: e.target.value })} />
            <input className="admin-input" placeholder="Descricao" value={promotionForm.description} onChange={(e) => setPromotionForm({ ...promotionForm, description: e.target.value })} />
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={promotionForm.active} onChange={(e) => setPromotionForm({ ...promotionForm, active: e.target.checked })} />Activa</label>
          <button type="submit" disabled={saving} className={`${primaryButton} mt-3`}>{saving ? "A guardar..." : "Guardar promocao"}</button>
        </form>
      ) : null}

      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <AdminListLoadingOverlay visible title="A carregar catalogo" message="Estamos a buscar produtos, categorias, marcas e promocoes." /> : null}
        {mode === "products" ? (
          <div className="divide-y divide-slate-100">
            {products.map((product) => (
              <div key={product.id} className="grid gap-4 p-4 lg:grid-cols-[96px_1fr_auto]">
                <img src={product.images?.[0]?.thumbnailUrl || "/placeholder.png"} alt={product.name} className="h-24 w-24 rounded-xl object-cover bg-slate-100" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-950">{product.name}</h2>
                    {product.badges?.map((badge) => <span key={badge} className="rounded-full bg-orange-50 px-2 py-1 text-xs font-bold text-[#E8431A]">{badge}</span>)}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{product.category?.name || "Sem categoria"} · {product.brand?.name || "Sem marca"} · {product.estimatedDeadline || "Sem prazo"}</p>
                  <p className="mt-2 font-[family-name:var(--font-sora)] text-lg font-black text-slate-950">{money(product.finalPrice)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className={secondaryButton} type="button" onClick={() => editProduct(product)}>Editar</button>
                    <button className={secondaryButton} type="button" onClick={() => void deleteItem("products", product.id)}>Remover</button>
                    <label className={`${secondaryButton} cursor-pointer`}>
                      {uploadingProductId === product.id ? "A enviar..." : "Enviar imagens"}
                      <input type="file" multiple accept="image/*" hidden onChange={(e) => void uploadImages(product.id, e.target.files)} />
                    </label>
                  </div>
                </div>
                <a href={`/catalogo/${product.slug}`} target="_blank" className="text-sm font-bold text-[#E8431A]" rel="noreferrer">Ver pagina</a>
              </div>
            ))}
          </div>
        ) : mode === "promotions" ? (
          <div className="divide-y divide-slate-100">{promotions.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold text-slate-950">{item.name}</p><p className="text-sm text-slate-500">{item.slug} · {item.active ? "Activa" : "Inactiva"}</p></div>
              <div className="flex gap-2"><button type="button" className={secondaryButton} onClick={() => setPromotionForm({ id: item.id, name: item.name, slug: item.slug, description: item.description || "", discountPercent: String(item.discountPercent || ""), startsAt: item.startsAt || "", endsAt: item.endsAt || "", active: item.active })}>Editar</button><button type="button" className={secondaryButton} onClick={() => void deleteItem("promotions", item.id)}>Remover</button></div>
            </div>
          ))}</div>
        ) : (
          <div className="divide-y divide-slate-100">{taxonomyItems.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold text-slate-950">{item.name}</p><p className="text-sm text-slate-500">{item.slug} · {item.active ? "Activo" : "Inactivo"}</p></div>
              <div className="flex gap-2"><button type="button" className={secondaryButton} onClick={() => setTaxonomyForm({ id: item.id, name: item.name, slug: item.slug, description: item.description || "", active: item.active, displayOrder: String(item.displayOrder || 0) })}>Editar</button><button type="button" className={secondaryButton} onClick={() => void deleteItem(mode, item.id)}>Remover</button></div>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}
