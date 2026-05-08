import { ProductFormView } from "@/components/admin/product-form-view";

export const metadata = { title: "Editar produto — Shopee X Digital Admin" };

type Props = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;
  return <ProductFormView productId={id} />;
}
