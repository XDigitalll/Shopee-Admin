import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function OrderPaymentPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/payments?orderId=${id}`);
}
